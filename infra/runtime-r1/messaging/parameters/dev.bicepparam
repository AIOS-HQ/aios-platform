using '../main.bicep'

param environment = 'dev'
param location = 'eastus'
param serviceBusNamespaceName = 'aiosr1deveastusmsg01'
param skuName = 'Standard'
param premiumMessagingUnits = 0
param tags = {
  owner: 'runtime-platform'
  costCenter: 'aios-runtime-r1'
  subscriptionId: 'a4cef627-4392-430a-89d7-143d95880c55'
  tenantId: 'db89245c-32e3-4980-8b7c-67e1d74a1382'
  resourceGroup: 'aios-core-rg'
  region: 'eastus'
  epic: 'runtime-r1-e2'
}
param enableDiagnostics = true
param logAnalyticsWorkspaceResourceId = '/subscriptions/a4cef627-4392-430a-89d7-143d95880c55/resourceGroups/aios-core-rg/providers/Microsoft.OperationalInsights/workspaces/aios-loganalytics-eastus'
