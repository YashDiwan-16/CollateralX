import { AlgorandClient } from '@algorandfoundation/algokit-utils'
import { CollateralXLiquidationExecutorFactory } from '../artifacts/collateralx_liquidation/CollateralXLiquidationExecutorClient'

export async function deploy() {
  console.log('=== Deploying CollateralXLiquidationExecutor ===')

  const algorand = AlgorandClient.fromEnvironment()
  const deployer = await algorand.account.fromEnvironment('DEPLOYER')

  const factory = algorand.client.getTypedAppFactory(CollateralXLiquidationExecutorFactory, {
    defaultSender: deployer.addr,
  })

  const { appClient } = await factory.deploy({
    onUpdate: 'append',
    onSchemaBreak: 'append',
    createParams: {
      method: 'createApplication',
      args: { admin: deployer.addr.toString() },
    },
  })

  console.log(`CollateralXLiquidationExecutor app id: ${appClient.appClient.appId}`)
}
