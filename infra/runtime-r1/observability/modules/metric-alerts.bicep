targetScope = 'resourceGroup'

param appInsightsResourceId string
param serviceBusNamespaceResourceId string
param keyVaultResourceId string
param actionGroupResourceId string
param thresholds object

resource appInsightsFailedRequests 'Microsoft.Insights/metricAlerts@2018-03-01' = {
  name: 'r1-appi-failed-requests'
  location: 'global'
  properties: {
    severity: 1
    enabled: true
    scopes: [
      appInsightsResourceId
    ]
    evaluationFrequency: 'PT5M'
    windowSize: 'PT5M'
    criteria: {
      allOf: [
        {
          name: 'failed-requests-threshold'
          metricNamespace: 'microsoft.insights/components'
          metricName: 'requests/failed'
          operator: 'GreaterThan'
          threshold: int(thresholds.appInsightsFailedRequestsCount)
          timeAggregation: 'Count'
          criterionType: 'StaticThresholdCriterion'
        }
      ]
      'odata.type': 'Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria'
    }
    autoMitigate: true
    actions: [
      {
        actionGroupId: actionGroupResourceId
      }
    ]
  }
}

resource appInsightsLatency 'Microsoft.Insights/metricAlerts@2018-03-01' = {
  name: 'r1-appi-latency'
  location: 'global'
  properties: {
    severity: 2
    enabled: true
    scopes: [
      appInsightsResourceId
    ]
    evaluationFrequency: 'PT5M'
    windowSize: 'PT15M'
    criteria: {
      allOf: [
        {
          name: 'response-time-threshold'
          metricNamespace: 'microsoft.insights/components'
          metricName: 'requests/duration'
          operator: 'GreaterThan'
          threshold: int(thresholds.appInsightsResponseTimeMs)
          timeAggregation: 'Average'
          criterionType: 'StaticThresholdCriterion'
        }
      ]
      'odata.type': 'Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria'
    }
    autoMitigate: true
    actions: [
      {
        actionGroupId: actionGroupResourceId
      }
    ]
  }
}

resource serviceBusBacklog 'Microsoft.Insights/metricAlerts@2018-03-01' = if (!empty(serviceBusNamespaceResourceId)) {
  name: 'r1-servicebus-backlog'
  location: 'global'
  properties: {
    severity: 2
    enabled: true
    scopes: [
      serviceBusNamespaceResourceId
    ]
    evaluationFrequency: 'PT5M'
    windowSize: 'PT15M'
    criteria: {
      allOf: [
        {
          name: 'incoming-message-threshold'
          metricNamespace: 'Microsoft.ServiceBus/namespaces'
          metricName: 'IncomingMessages'
          operator: 'GreaterThan'
          threshold: int(thresholds.serviceBusIncomingMessagesCount)
          timeAggregation: 'Total'
          criterionType: 'StaticThresholdCriterion'
        }
      ]
      'odata.type': 'Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria'
    }
    autoMitigate: true
    actions: [
      {
        actionGroupId: actionGroupResourceId
      }
    ]
  }
}

resource serviceBusDeadletter 'Microsoft.Insights/metricAlerts@2018-03-01' = if (!empty(serviceBusNamespaceResourceId)) {
  name: 'r1-servicebus-deadletter'
  location: 'global'
  properties: {
    severity: 1
    enabled: true
    scopes: [
      serviceBusNamespaceResourceId
    ]
    evaluationFrequency: 'PT5M'
    windowSize: 'PT15M'
    criteria: {
      allOf: [
        {
          name: 'deadletter-threshold'
          metricNamespace: 'Microsoft.ServiceBus/namespaces'
          metricName: 'DeadletteredMessages'
          operator: 'GreaterThan'
          threshold: int(thresholds.serviceBusDeadletterCount)
          timeAggregation: 'Total'
          criterionType: 'StaticThresholdCriterion'
        }
      ]
      'odata.type': 'Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria'
    }
    autoMitigate: true
    actions: [
      {
        actionGroupId: actionGroupResourceId
      }
    ]
  }
}

resource keyVault5xx 'Microsoft.Insights/metricAlerts@2018-03-01' = if (!empty(keyVaultResourceId)) {
  name: 'r1-keyvault-5xx'
  location: 'global'
  properties: {
    severity: 1
    enabled: true
    scopes: [
      keyVaultResourceId
    ]
    evaluationFrequency: 'PT5M'
    windowSize: 'PT5M'
    criteria: {
      allOf: [
        {
          name: 'keyvault-5xx-threshold'
          metricNamespace: 'Microsoft.KeyVault/vaults'
          metricName: 'ServiceApiResult'
          operator: 'GreaterThan'
          threshold: int(thresholds.keyVaultApiResult5xxCount)
          timeAggregation: 'Count'
          criterionType: 'StaticThresholdCriterion'
          dimensions: [
            {
              name: 'StatusCode'
              operator: 'Include'
              values: [
                '500'
                '502'
                '503'
                '504'
              ]
            }
          ]
        }
      ]
      'odata.type': 'Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria'
    }
    autoMitigate: true
    actions: [
      {
        actionGroupId: actionGroupResourceId
      }
    ]
  }
}

output metricAlertResourceIds array = concat(
  [
    appInsightsFailedRequests.id
    appInsightsLatency.id
  ],
  !empty(serviceBusNamespaceResourceId) ? [
    serviceBusBacklog.id
    serviceBusDeadletter.id
  ] : [],
  !empty(keyVaultResourceId) ? [
    keyVault5xx.id
  ] : []
)
