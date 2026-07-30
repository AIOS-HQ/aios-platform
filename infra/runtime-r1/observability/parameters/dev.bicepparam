using '../main.bicep'

param environment = 'dev'
param location = 'eastus2'
param logAnalyticsWorkspaceName = 'aios-r1-dev-law'
param applicationInsightsName = 'aios-r1-dev-appi'
param logAnalyticsSku = 'PerGB2018'
param logAnalyticsRetentionInDays = 60
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
  name: 'aios-r1-dev-ag-runtime-alerts'
  shortName: 'aiosdevops'
  emailReceivers: []
  webhookReceivers: []
}
param alertThresholds = {
  appInsightsFailedRequestsCount: 10
  appInsightsResponseTimeMs: 2500
  serviceBusIncomingMessagesCount: 500
  serviceBusDeadletterCount: 10
  keyVaultApiResult5xxCount: 2
}
param enableDiagnostics = true
