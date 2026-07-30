using '../main.bicep'

param environment = 'prod'
param location = 'eastus2'
param serviceBusNamespaceName = 'aios-r1-prod-sb'
param skuName = 'Premium'
param premiumMessagingUnits = 1
param tags = {
  owner: 'runtime-platform'
  costCenter: 'aios-runtime-r1'
}
param enableDiagnostics = true
param logAnalyticsWorkspaceResourceId = '/subscriptions/<subscription-id>/resourceGroups/<rg-name>/providers/Microsoft.OperationalInsights/workspaces/<workspace-name>'
