using '../main.bicep'

param environment = 'prod'
param location = 'eastus2'
param logAnalyticsWorkspaceName = 'aios-r1-prod-law'
param applicationInsightsName = 'aios-r1-prod-appi'
param logAnalyticsSku = 'PerGB2018'
param logAnalyticsRetentionInDays = 120
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
  name: 'aios-r1-prod-ag-runtime-alerts'
  shortName: 'aiosprodop'
  emailReceivers: []
  webhookReceivers: []
}
param alertThresholds = {
  appInsightsFailedRequestsCount: 25
  appInsightsResponseTimeMs: 3000
  serviceBusIncomingMessagesCount: 1000
  serviceBusDeadletterCount: 50
  keyVaultApiResult5xxCount: 5
}
param enableDiagnostics = true
