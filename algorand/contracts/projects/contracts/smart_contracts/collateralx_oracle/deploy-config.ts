import { AlgorandClient } from '@algorandfoundation/algokit-utils'
import { CollateralXOracleAdapterFactory } from '../artifacts/collateralx_oracle/CollateralXOracleAdapterClient'

export async function deploy() {
  console.log('=== Deploying CollateralXOracleAdapter ===')

  const algorand = AlgorandClient.fromEnvironment()
  const deployer = await algorand.account.fromEnvironment('DEPLOYER')

  const factory = algorand.client.getTypedAppFactory(CollateralXOracleAdapterFactory, {
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

  console.log(`CollateralXOracleAdapter app id: ${appClient.appClient.appId}`)
}

