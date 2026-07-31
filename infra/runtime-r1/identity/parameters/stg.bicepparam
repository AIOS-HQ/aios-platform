using '../main.bicep'

param environment = 'stg'
param location = 'eastus2'
param keyVaultName = 'kv-aios-stg-eastus2'
param containerAppsEnvironmentResourceId = '/subscriptions/<subscription-id>/resourceGroups/<rg-name>/providers/Microsoft.App/managedEnvironments/<aca-env-name>'
param containerAppResourceIds = {
  harmony: '/subscriptions/<subscription-id>/resourceGroups/<rg-name>/providers/Microsoft.App/containerApps/<app-name>'
  executionApi: '/subscriptions/<subscription-id>/resourceGroups/<rg-name>/providers/Microsoft.App/containerApps/<app-name>'
  mason: '/subscriptions/<subscription-id>/resourceGroups/<rg-name>/providers/Microsoft.App/containerApps/<app-name>'
  julius: '/subscriptions/<subscription-id>/resourceGroups/<rg-name>/providers/Microsoft.App/containerApps/<app-name>'
  workerRuntime: '/subscriptions/<subscription-id>/resourceGroups/<rg-name>/providers/Microsoft.App/containerApps/<app-name>'
}
param tags = {
  owner: 'runtime-platform'
  costCenter: 'aios-runtime-r1'
}
