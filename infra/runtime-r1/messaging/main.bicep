targetScope = 'resourceGroup'

@description('Environment short name (dev|stg|prod).')
param environment string

@description('Azure region for Service Bus namespace.')
param location string = resourceGroup().location

@description('Resource name prefix. Defaults to aios-r1-<env>.')
param namePrefix string = 'aios-r1-${environment}'

@description('Service Bus namespace name.')
param serviceBusNamespaceName string = '${namePrefix}-sb'

@allowed([
  'Basic'
  'Standard'
  'Premium'
])
@description('Service Bus SKU tier.')
param skuName string = 'Standard'

@minValue(0)
@maxValue(16)
@description('Premium messaging units. Ignored for non-Premium SKUs.')
param premiumMessagingUnits int = 0

@description('Optional additional tags applied to messaging resources.')
param tags object = {}

@description('Queue configuration map keyed by logical queue key.')
param queueConfig object = {
  executionIntents: {
    name: '${namePrefix}-execution-intents'
    requiresSession: false
    enablePartitioning: true
    lockDuration: 'PT1M'
    maxDeliveryCount: 8
    defaultMessageTimeToLive: 'P7D'
    deadLetteringOnMessageExpiration: true
    duplicateDetectionHistoryTimeWindow: 'PT10M'
    requiresDuplicateDetection: true
    maxSizeInMegabytes: 1024
  }
  executionEvents: {
    name: '${namePrefix}-execution-events'
    requiresSession: false
    enablePartitioning: true
    lockDuration: 'PT1M'
    maxDeliveryCount: 10
    defaultMessageTimeToLive: 'P14D'
    deadLetteringOnMessageExpiration: true
    duplicateDetectionHistoryTimeWindow: 'PT10M'
    requiresDuplicateDetection: true
    maxSizeInMegabytes: 1024
  }
  executionResults: {
    name: '${namePrefix}-execution-results'
    requiresSession: false
    enablePartitioning: true
    lockDuration: 'PT1M'
    maxDeliveryCount: 8
    defaultMessageTimeToLive: 'P7D'
    deadLetteringOnMessageExpiration: true
    duplicateDetectionHistoryTimeWindow: 'PT10M'
    requiresDuplicateDetection: true
    maxSizeInMegabytes: 1024
  }
  executionValidation: {
    name: '${namePrefix}-execution-validation'
    requiresSession: false
    enablePartitioning: true
    lockDuration: 'PT1M'
    maxDeliveryCount: 8
    defaultMessageTimeToLive: 'P7D'
    deadLetteringOnMessageExpiration: true
    duplicateDetectionHistoryTimeWindow: 'PT10M'
    requiresDuplicateDetection: true
    maxSizeInMegabytes: 1024
  }
  approvalEvents: {
    name: '${namePrefix}-approval-events'
    requiresSession: false
    enablePartitioning: true
    lockDuration: 'PT1M'
    maxDeliveryCount: 10
    defaultMessageTimeToLive: 'P14D'
    deadLetteringOnMessageExpiration: true
    duplicateDetectionHistoryTimeWindow: 'PT10M'
    requiresDuplicateDetection: true
    maxSizeInMegabytes: 1024
  }
  healthEvents: {
    name: '${namePrefix}-health-events'
    requiresSession: false
    enablePartitioning: true
    lockDuration: 'PT30S'
    maxDeliveryCount: 5
    defaultMessageTimeToLive: 'P3D'
    deadLetteringOnMessageExpiration: true
    duplicateDetectionHistoryTimeWindow: 'PT5M'
    requiresDuplicateDetection: true
    maxSizeInMegabytes: 1024
  }
}

@description('Execution topic configuration for fan-out event processing.')
param executionTopic object = {
  enabled: true
  name: '${namePrefix}-execution-topic'
  defaultMessageTimeToLive: 'P14D'
  duplicateDetectionHistoryTimeWindow: 'PT10M'
  requiresDuplicateDetection: true
  enablePartitioning: true
  maxSizeInMegabytes: 1024
}

@description('Subscriptions for execution topic keyed by logical subscriber.')
param executionTopicSubscriptions object = {
  ledgerWriter: {
    name: 'ledger-writer'
    maxDeliveryCount: 10
    lockDuration: 'PT1M'
    deadLetteringOnMessageExpiration: true
    defaultMessageTimeToLive: 'P14D'
    requiresSession: false
    forwardDeadLetteredMessagesTo: ''
  }
  observability: {
    name: 'observability'
    maxDeliveryCount: 10
    lockDuration: 'PT1M'
    deadLetteringOnMessageExpiration: true
    defaultMessageTimeToLive: 'P14D'
    requiresSession: false
    forwardDeadLetteredMessagesTo: ''
  }
  incidentAutomation: {
    name: 'incident-automation'
    maxDeliveryCount: 10
    lockDuration: 'PT1M'
    deadLetteringOnMessageExpiration: true
    defaultMessageTimeToLive: 'P14D'
    requiresSession: false
    forwardDeadLetteredMessagesTo: ''
  }
}

@description('Log Analytics workspace resource ID for diagnostics. Empty disables diagnostic settings.')
param logAnalyticsWorkspaceResourceId string = ''

@description('Diagnostic setting name.')
param diagnosticSettingName string = 'servicebus-diagnostics'

@description('Enable diagnostic settings on namespace.')
param enableDiagnostics bool = true

module namespace './modules/servicebus-namespace.bicep' = {
  name: 'servicebus-namespace'
  params: {
    location: location
    namespaceName: serviceBusNamespaceName
    skuName: skuName
    premiumMessagingUnits: premiumMessagingUnits
    tags: union({
      environment: environment
      workload: 'runtime-r1'
      scope: 'messaging'
    }, tags)
  }
}

module queues './modules/servicebus-queues.bicep' = {
  name: 'servicebus-queues'
  params: {
    namespaceName: namespace.outputs.namespaceName
    queueConfig: queueConfig
  }
}

module topic './modules/servicebus-topic.bicep' = if (executionTopic.enabled) {
  name: 'servicebus-execution-topic'
  params: {
    namespaceName: namespace.outputs.namespaceName
    topicName: executionTopic.name
    defaultMessageTimeToLive: executionTopic.defaultMessageTimeToLive
    duplicateDetectionHistoryTimeWindow: executionTopic.duplicateDetectionHistoryTimeWindow
    requiresDuplicateDetection: executionTopic.requiresDuplicateDetection
    enablePartitioning: executionTopic.enablePartitioning
    maxSizeInMegabytes: executionTopic.maxSizeInMegabytes
    subscriptions: executionTopicSubscriptions
  }
}

module diagnostics './modules/servicebus-diagnostics.bicep' = if (enableDiagnostics && !empty(logAnalyticsWorkspaceResourceId)) {
  name: 'servicebus-diagnostics'
  params: {
    namespaceResourceId: namespace.outputs.namespaceResourceId
    logAnalyticsWorkspaceResourceId: logAnalyticsWorkspaceResourceId
    diagnosticSettingName: diagnosticSettingName
  }
}

output namespaceName string = namespace.outputs.namespaceName
output namespaceResourceId string = namespace.outputs.namespaceResourceId
output queueNames object = queues.outputs.queueNames
output queueResourceIds object = queues.outputs.queueResourceIds
output topicName string = executionTopic.enabled ? executionTopic.name : ''
output topicResourceId string = executionTopic.enabled ? topic!.outputs.topicResourceId : ''
output topicSubscriptionNames array = executionTopic.enabled ? topic!.outputs.subscriptionNames : []
output diagnosticsEnabled bool = enableDiagnostics && !empty(logAnalyticsWorkspaceResourceId)
output deploymentNotes object = {
  message: 'Epic E2 provisions messaging infrastructure only. No runtime consumers/producers are deployed in this template.'
  queueCount: length(items(queueConfig))
  topicEnabled: executionTopic.enabled
}
