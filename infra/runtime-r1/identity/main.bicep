targetScope = 'resourceGroup'

@description('Environment short name (dev|stg|prod).')
param environment string

@description('Azure region for user-assigned identities.')
param location string = resourceGroup().location

@description('Name of existing Key Vault used for runtime secrets.')
param keyVaultName string

@description('Optional existing Container Apps environment resource ID for documentation outputs.')
param containerAppsEnvironmentResourceId string = ''

@description('Optional existing Container App resource IDs keyed by runtime service name. These are not created by this template.')
param containerAppResourceIds object = {}

@description('Optional additional tags applied to all created identities.')
param tags object = {}

@description('Resource name prefix. Defaults to aios-r1-<env>.')
param namePrefix string = 'aios-r1-${environment}'

@description('User-assigned identity names keyed by runtime service role.')
param identityNames object = {
  harmony: '${namePrefix}-mi-harmony'
  executionApi: '${namePrefix}-mi-execution-api'
  mason: '${namePrefix}-mi-mason'
  julius: '${namePrefix}-mi-julius'
  workerRuntime: '${namePrefix}-mi-worker-runtime'
  futureRuntime: '${namePrefix}-mi-future-runtime'
}

@allowed([
  'Key Vault Secrets User'
])
@description('Built-in role name used for Key Vault secret retrieval access by runtime identities.')
param keyVaultSecretsReadRoleName string = 'Key Vault Secrets User'

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' existing = {
  name: keyVaultName
}

module managedIdentities './modules/managed-identities.bicep' = {
  name: 'managed-identities'
  params: {
    location: location
    tags: union({
      environment: environment
      workload: 'runtime-r1'
      scope: 'identity'
    }, tags)
    identityNames: identityNames
  }
}

module keyVaultAccess './modules/keyvault-access-rbac.bicep' = {
  name: 'keyvault-access-rbac'
  params: {
    keyVaultResourceId: keyVault.id
    roleDefinitionName: keyVaultSecretsReadRoleName
    principalIds: managedIdentities.outputs.principalIds
    principalType: 'ServicePrincipal'
  }
}

module acaIdentityBindings './modules/aca-identity-bindings.bicep' = {
  name: 'aca-identity-bindings'
  params: {
    containerAppResourceIds: containerAppResourceIds
    identityResourceIds: managedIdentities.outputs.resourceIds
  }
}

output identityResourceIds object = managedIdentities.outputs.resourceIds
output identityPrincipalIds object = managedIdentities.outputs.principalIds
output keyVaultRoleAssignments array = keyVaultAccess.outputs.roleAssignmentIds
output acaIdentityBindingPlan object = acaIdentityBindings.outputs.bindingPlan
output deploymentNotes object = {
  containerAppsEnvironmentResourceId: containerAppsEnvironmentResourceId
  message: 'This template provisions user-assigned managed identities and Key Vault RBAC assignments only. Container Apps resources are not created here.'
}
