targetScope = 'resourceGroup'

param location string
param workspaceName string
param skuName string
param retentionInDays int
param enableDailyCap bool
param dailyCapGb int
param tags object

resource workspace 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: workspaceName
  location: location
  tags: tags
  properties: {
    sku: {
      name: skuName
    }
    retentionInDays: retentionInDays
    workspaceCapping: {
      dailyQuotaGb: enableDailyCap ? dailyCapGb : -1
    }
    features: {
      enableLogAccessUsingOnlyResourcePermissions: true
    }
    publicNetworkAccessForIngestion: 'Enabled'
    publicNetworkAccessForQuery: 'Enabled'
  }
}

output workspaceResourceId string = workspace.id
output workspaceName string = workspace.name
