targetScope = 'resourceGroup'

@description('Azure region where identities are created.')
param location string

@description('Common tags applied to identities.')
param tags object = {}

@description('Identity names keyed by runtime service role.')
param identityNames object

resource harmonyIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: string(identityNames.harmony)
  location: location
  tags: tags
}

resource executionApiIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: string(identityNames.executionApi)
  location: location
  tags: tags
}

resource masonIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: string(identityNames.mason)
  location: location
  tags: tags
}

resource juliusIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: string(identityNames.julius)
  location: location
  tags: tags
}

resource workerRuntimeIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: string(identityNames.workerRuntime)
  location: location
  tags: tags
}

resource futureRuntimeIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: string(identityNames.futureRuntime)
  location: location
  tags: tags
}

output resourceIds object = {
  harmony: harmonyIdentity.id
  executionApi: executionApiIdentity.id
  mason: masonIdentity.id
  julius: juliusIdentity.id
  workerRuntime: workerRuntimeIdentity.id
  futureRuntime: futureRuntimeIdentity.id
}

output principalIds object = {
  harmony: harmonyIdentity.properties.principalId
  executionApi: executionApiIdentity.properties.principalId
  mason: masonIdentity.properties.principalId
  julius: juliusIdentity.properties.principalId
  workerRuntime: workerRuntimeIdentity.properties.principalId
  futureRuntime: futureRuntimeIdentity.properties.principalId
}
