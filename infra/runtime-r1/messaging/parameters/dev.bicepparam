using '../main.bicep'

param environment = 'dev'
param location = 'eastus2'
param serviceBusNamespaceName = 'aios-r1-dev-sb'
param skuName = 'Standard'
param premiumMessagingUnits = 0
param tags = {
  owner: 'runtime-platform'
  costCenter: 'aios-runtime-r1'
}
param enableDiagnostics = true
param logAnalyticsWorkspaceResourceId = '/subscriptions/<subscription-id>/resourceGroups/<rg-name>/providers/Microsoft.OperationalInsights/workspaces/<workspace-name>'
