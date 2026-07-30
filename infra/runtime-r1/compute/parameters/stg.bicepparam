using '../main.bicep'

param environment = 'stg'
param location = 'eastus2'
param containerAppsEnvironmentName = 'aios-r1-stg-ca-env'
param logAnalyticsWorkspaceResourceId = '/subscriptions/<subscription-id>/resourceGroups/<rg-name>/providers/Microsoft.OperationalInsights/workspaces/<workspace-name>'
param appInsightsConnectionString = ''
param containerRegistryServer = '<registry-name>.azurecr.io'
param containerRegistryIdentityResourceId = ''
param keyVaultUri = 'https://<keyvault-name>.vault.azure.net/'
param managedIdentityResourceIds = {
  harmony: '/subscriptions/<subscription-id>/resourceGroups/<rg-name>/providers/Microsoft.ManagedIdentity/userAssignedIdentities/<identity-name>'
  executionApi: '/subscriptions/<subscription-id>/resourceGroups/<rg-name>/providers/Microsoft.ManagedIdentity/userAssignedIdentities/<identity-name>'
  mason: '/subscriptions/<subscription-id>/resourceGroups/<rg-name>/providers/Microsoft.ManagedIdentity/userAssignedIdentities/<identity-name>'
  julius: '/subscriptions/<subscription-id>/resourceGroups/<rg-name>/providers/Microsoft.ManagedIdentity/userAssignedIdentities/<identity-name>'
  workerRuntime: '/subscriptions/<subscription-id>/resourceGroups/<rg-name>/providers/Microsoft.ManagedIdentity/userAssignedIdentities/<identity-name>'
  futureRuntime: '/subscriptions/<subscription-id>/resourceGroups/<rg-name>/providers/Microsoft.ManagedIdentity/userAssignedIdentities/<identity-name>'
}
param tags = {
  owner: 'runtime-platform'
  costCenter: 'aios-runtime-r1'
}
