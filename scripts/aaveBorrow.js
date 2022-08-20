const { getNamedAccounts, ethers } = require("hardhat")
const { getWeth, AMOUNT } = require("../scripts/getWeth")

async function main() {
    // the protocol treats everything like an erc20 standard
    // weth is basically ethereum in an erc20 token standard
    await getWeth()
    const { deployer } = await getNamedAccounts()
    // abi and address to interact with the aave contract

    // lending pool address provider: 0xB53C1a33016B2DC2fF3653530bfF1848a515c8c5
    // lending pool: ^

    const lendingPool = await getLendingPool(deployer)
    console.log(`Lending Pool address ${lendingPool.address}`)

    // DEPOSITING
    // first we need to approve it
    // we wanna give the lending pool the apporval to pool our weth token from our account
    const wethTokenAddress = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"
    await approveErc20(wethTokenAddress, lendingPool.address, AMOUNT, deployer)
    console.log("Depositing...")
    // look at this function in the aave developers guide
    await lendingPool.deposit(wethTokenAddress, AMOUNT, deployer, 0)
    console.log("Deposited!")

    // BORROWING
    // we wanna know how much we have borrowed, how much we have in collateral and how much we can borrow
    // for this we look at getUserAccountData in aave guide and extract the atributes we need for this information
    let { availableBorrowsETH, totalDebtETH } = await getBorrowUserData(lendingPool, deployer)

    // availableBorrowsETH ?? Whats the conversion rate on DAI
    const daiPrice = await getDaiPrice()

    // now figure out whats the amout of Dai we can borrow (converting the amount of ETH we can borrow that we already know)
    const amountDaiToBorrow = availableBorrowsETH.toString() * 0.95 * (1 / daiPrice.toNumber()) // 0.95 because we dont wanna hit the cap of maximum borrowed
    console.log(`You can borrow ${amountDaiToBorrow} DAI`)
    const amountDaiToBorrowWei = ethers.utils.parseEther(amountDaiToBorrow.toString()) // so that it has the same decimals as wei

    // after we know this, we can actually start borrowing
    const daiTokenAddress = "0x6b175474e89094c44da98b954eedeac495271d0f"
    await borrowDai(daiTokenAddress, lendingPool, amountDaiToBorrowWei, deployer)

    // we run this function again to be able to see that everything changed
    await getBorrowUserData(lendingPool, deployer)

    // now we want to repay the amount we borrowed
    await repay(amountDaiToBorrowWei, daiTokenAddress, lendingPool, deployer)

    // we run this function again to be able to see that everything changed
    await getBorrowUserData(lendingPool, deployer)

    // we still have ETH borrowed because we payed back
}

async function repay(amount, daiAddress, lendingPool, account) {
    // we need to approve sending the dai back to the contract
    await approveErc20(daiAddress, lendingPool.address, amount, account)
    const repayTx = await lendingPool.repay(daiAddress, amount, 1, account)
    await repayTx.wait(1)
    console.log(`Repayed!`)
}

async function borrowDai(daiAddress, lendingPool, amountDaiToBorrowWei, account) {
    const borrowTx = await lendingPool.borrow(daiAddress, amountDaiToBorrowWei, 1, 0, account)
    await borrowTx.wait(1)
    console.log(`Youve borrowed!`)
}

async function getDaiPrice() {
    // we dont need to connect it to a wallet because we are just going to be reading (not sending txns so we dont need a signer)
    const daiEthPriceFeed = await ethers.getContractAt(
        "AggregatorV3Interface",
        "0x773616E4d11A78F511299002da57A0a94577F1f4"
    )
    // with this syntax it only grabs the first value
    const price = (await daiEthPriceFeed.latestRoundData())[1]
    console.log(`The DAI/ETH price is ${price.toString()}`)
    return price
}

async function getBorrowUserData(lendingPool, account) {
    const {
        totalCollateralETH,
        totalDebtETH,
        availableBorrowsETH
    } = await lendingPool.getUserAccountData(account)
    console.log(`You have ${totalCollateralETH} worth of ETH deposited`)
    console.log(`You have ${totalDebtETH} worth of ETH borrowed`)
    console.log(`You can borrow ${availableBorrowsETH} worth of ETH`)
    return { availableBorrowsETH, totalDebtETH }
}

async function approveErc20(erc20Address, spenderAddress, amountToSpend, account) {
    const erc20Token = await ethers.getContractAt("IERC20", erc20Address, account)
    const tx = await erc20Token.approve(spenderAddress, amountToSpend)
    await tx.wait(1)
    console.log("Approved!")
}

async function getLendingPool(account) {
    const lendingPoolAddressProvider = await ethers.getContractAt(
        "ILendingPoolAddressesProvider",
        "0xb53c1a33016b2dc2ff3653530bff1848a515c8c5",
        account
    )

    const lendingPoolAddress = await lendingPoolAddressProvider.getLendingPool()
    const lendingPool = await ethers.getContractAt("ILendingPool", lendingPoolAddress, account)
    return lendingPool
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error)
        process.exit(1)
    })
