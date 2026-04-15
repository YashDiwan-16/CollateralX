import { AlgorandClient } from '@algorandfoundation/algokit-utils'
import { CollateralXStablecoinControllerFactory } from '../artifacts/collateralx_stablecoin/CollateralXStablecoinControllerClient'

export async function deploy() {
  console.log('=== Deploying CollateralXStablecoinController ===')

  const algorand = AlgorandClient.fromEnvironment()
  const deployer = await algorand.account.fromEnvironment('DEPLOYER')

  const factory = algorand.client.getTypedAppFactory(CollateralXStablecoinControllerFactory, {
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

  console.log(`CollateralXStablecoinController app id: ${appClient.appClient.appId}`)
}

