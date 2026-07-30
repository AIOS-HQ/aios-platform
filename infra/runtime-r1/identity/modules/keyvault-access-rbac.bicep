targetScope = 'resourceGroup'

@description('Resource ID of existing Key Vault.')
param keyVaultResourceId string

@description('Built-in role definition name to assign.')
param roleDefinitionName string

@description('Principal IDs keyed by runtime identity role.')
param principalIds object

@allowed([
  'ServicePrincipal'
])
@description('AAD principal type used for managed identities.')
param principalType string = 'ServicePrincipal'

// Built-in role IDs are fixed GUIDs. Key Vault Secrets User:
var keyVaultSecretsUserRoleId = '4633458b-17de-408a-b874-0445c86b69e6'
var resolvedRoleDefinitionId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', keyVaultSecretsUserRoleId)

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' existing = {
  name: last(split(keyVaultResourceId, '/'))
}

resource harmonyKvSecretsUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(keyVaultResourceId, 'harmony', string(principalIds.harmony), roleDefinitionName)
  scope: keyVault
  properties: {
    principalId: string(principalIds.harmony)
    roleDefinitionId: resolvedRoleDefinitionId
    principalType: principalType
  }
}

resource executionApiKvSecretsUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(keyVaultResourceId, 'execution-api', string(principalIds.executionApi), roleDefinitionName)
  scope: keyVault
  properties: {
    principalId: string(principalIds.executionApi)
    roleDefinitionId: resolvedRoleDefinitionId
    principalType: principalType
  }
}

resource masonKvSecretsUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(keyVaultResourceId, 'mason', string(principalIds.mason), roleDefinitionName)
  scope: keyVault
  properties: {
    principalId: string(principalIds.mason)
    roleDefinitionId: resolvedRoleDefinitionId
    principalType: principalType
  }
}

resource juliusKvSecretsUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(keyVaultResourceId, 'julius', string(principalIds.julius), roleDefinitionName)
  scope: keyVault
  properties: {
    principalId: string(principalIds.julius)
    roleDefinitionId: resolvedRoleDefinitionId
    principalType: principalType
  }
}

resource workerKvSecretsUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(keyVaultResourceId, 'worker-runtime', string(principalIds.workerRuntime), roleDefinitionName)
  scope: keyVault
  properties: {
    principalId: string(principalIds.workerRuntime)
    roleDefinitionId: resolvedRoleDefinitionId
    principalType: principalType
  }
}

resource futureRuntimeKvSecretsUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(keyVaultResourceId, 'future-runtime', string(principalIds.futureRuntime), roleDefinitionName)
  scope: keyVault
  properties: {
    principalId: string(principalIds.futureRuntime)
    roleDefinitionId: resolvedRoleDefinitionId
    principalType: principalType
  }
}

output roleAssignmentIds array = [
  harmonyKvSecretsUser.id
  executionApiKvSecretsUser.id
  masonKvSecretsUser.id
  juliusKvSecretsUser.id
  workerKvSecretsUser.id
  futureRuntimeKvSecretsUser.id
]
