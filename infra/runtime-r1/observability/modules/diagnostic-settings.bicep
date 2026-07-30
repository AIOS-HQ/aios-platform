targetScope = 'resourceGroup'

param workspaceResourceId string
param scopes object
param diagnosticSettingName string

var diagnosticTargets = [
  {
    key: 'serviceBusNamespaceResourceId'
    logs: [
      'OperationalLogs'
      'VNetAndIPFilteringLogs'
      'RuntimeAuditLogs'
      'ApplicationMetricsLogs'
    ]
    metrics: [
      'AllMetrics'
    ]
  }
  {
    key: 'keyVaultResourceId'
    logs: [
      'AuditEvent'
    ]
    metrics: [
      'AllMetrics'
    ]
  }
  {
    key: 'containerAppsEnvironmentResourceId'
    logs: [
      'ContainerAppConsoleLogs'
      'ContainerAppSystemLogs'
    ]
    metrics: [
      'AllMetrics'
    ]
  }
]

resource diagnostics 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = [for target in diagnosticTargets: if (!empty(string(scopes[target.key])) ) {
  name: '${diagnosticSettingName}-${target.key}'
  scope: {
    id: string(scopes[target.key])
  }
  properties: {
    workspaceId: workspaceResourceId
    logs: [for logCategory in target.logs: {
      category: logCategory
      enabled: true
    }]
    metrics: [for metricCategory in target.metrics: {
      category: metricCategory
      enabled: true
    }]
  }
}]

output diagnosticSettingResourceIds object = {
  serviceBusNamespace: !empty(string(scopes.serviceBusNamespaceResourceId)) ? diagnostics[0].id : ''
  keyVault: !empty(string(scopes.keyVaultResourceId)) ? diagnostics[1].id : ''
  containerAppsEnvironment: !empty(string(scopes.containerAppsEnvironmentResourceId)) ? diagnostics[2].id : ''
}
