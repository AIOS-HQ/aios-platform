targetScope = 'resourceGroup'

param namespaceResourceId string
param logAnalyticsWorkspaceResourceId string
param diagnosticSettingName string

resource namespace 'Microsoft.ServiceBus/namespaces@2023-01-01-preview' existing = {
  name: last(split(namespaceResourceId, '/'))
}

resource diagnostics 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  name: diagnosticSettingName
  scope: namespace
  properties: {
    workspaceId: logAnalyticsWorkspaceResourceId
    logs: [
      {
        category: 'OperationalLogs'
        enabled: true
      }
      {
        category: 'VNetAndIPFilteringLogs'
        enabled: true
      }
      {
        category: 'RuntimeAuditLogs'
        enabled: true
      }
      {
        category: 'ApplicationMetricsLogs'
        enabled: true
      }
    ]
    metrics: [
      {
        category: 'AllMetrics'
        enabled: true
      }
    ]
  }
}

output diagnosticSettingResourceId string = diagnostics.id
