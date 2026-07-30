targetScope = 'resourceGroup'

@description('Service Bus namespace name.')
param namespaceName string

@description('Queue settings keyed by logical queue key.')
param queueConfig object

resource namespace 'Microsoft.ServiceBus/namespaces@2023-01-01-preview' existing = {
  name: namespaceName
}

resource queues 'Microsoft.ServiceBus/namespaces/queues@2023-01-01-preview' = [for queueEntry in items(queueConfig): {
  name: queueEntry.value.name
  parent: namespace
  properties: {
    lockDuration: queueEntry.value.lockDuration
    maxSizeInMegabytes: queueEntry.value.maxSizeInMegabytes
    maxDeliveryCount: queueEntry.value.maxDeliveryCount
    defaultMessageTimeToLive: queueEntry.value.defaultMessageTimeToLive
    deadLetteringOnMessageExpiration: queueEntry.value.deadLetteringOnMessageExpiration
    enablePartitioning: queueEntry.value.enablePartitioning
    requiresDuplicateDetection: queueEntry.value.requiresDuplicateDetection
    duplicateDetectionHistoryTimeWindow: queueEntry.value.duplicateDetectionHistoryTimeWindow
    requiresSession: queueEntry.value.requiresSession
    status: 'Active'
  }
}]

output queueNames object = { for queueEntry in items(queueConfig): queueEntry.key: queueEntry.value.name }
output queueResourceIds object = { for (queueEntry, i) in items(queueConfig): queueEntry.key: queues[i].id }
