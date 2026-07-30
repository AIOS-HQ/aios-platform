using '../main.bicep'

param environment = 'stg'
param location = 'eastus2'
param logAnalyticsWorkspaceName = 'aios-r1-stg-law'
param applicationInsightsName = 'aios-r1-stg-appi'
param logAnalyticsSku = 'PerGB2018'
param logAnalyticsRetentionInDays = 90
param enableWorkspaceDailyCap = false
param logAnalyticsDailyCapGb = -1
param tags = {
  owner: 'runtime-platform'
  costCenter: 'aios-runtime-r1'
}
param diagnosticScopes = {
  serviceBusNamespaceResourceId: '/subscriptions/<subscription-id>/resourceGroups/<rg-name>/providers/Microsoft.ServiceBus/namespaces/<namespace-name>'
  keyVaultResourceId: '/subscriptions/<subscription-id>/resourceGroups/<rg-name>/providers/Microsoft.KeyVault/vaults/<key-vault-name>'
  containerAppsEnvironmentResourceId: '/subscriptions/<subscription-id>/resourceGroups/<rg-name>/providers/Microsoft.App/managedEnvironments/<aca-env-name>'
  controlPlaneContainerAppResourceId: ''
  masonContainerAppResourceId: ''
  juliusContainerAppResourceId: ''
  workerContainerAppResourceId: ''
}
param actionGroup = {
  enabled: true
  name: 'aios-r1-stg-ag-runtime-alerts'
  shortName: 'aiosstgops'
  emailReceivers: []
  webhookReceivers: []
}
param alertThresholds = {
  appInsightsFailedRequestsCount: 20
  appInsightsResponseTimeMs: 3000
  serviceBusIncomingMessagesCount: 800
  serviceBusDeadletterCount: 25
  keyVaultApiResult5xxCount: 3
}
param enableDiagnostics = true
