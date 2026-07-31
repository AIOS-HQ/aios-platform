using '../main.bicep'

param environment = 'dev'
param location = 'eastus'
param keyVaultName = 'aioshq-keyvalt'
param containerAppsEnvironmentResourceId = '/subscriptions/a4cef627-4392-430a-89d7-143d95880c55/resourceGroups/aios-core-rg/providers/Microsoft.App/managedEnvironments/managedEnvironment-aioscorerg-a01d'
param containerAppResourceIds = {
  harmony: '/subscriptions/a4cef627-4392-430a-89d7-143d95880c55/resourceGroups/aios-core-rg/providers/Microsoft.App/containerApps/aios-runtime'
  executionApi: ''
  mason: ''
  julius: ''
  workerRuntime: ''
  futureRuntime: ''
}
param tags = {
  owner: 'runtime-platform'
  costCenter: 'aios-runtime-r1'
  environment: 'dev'
  tenantId: 'db89245c-32e3-4980-8b7c-67e1d74a1382'
  subscriptionId: 'a4cef627-4392-430a-89d7-143d95880c55'
}
