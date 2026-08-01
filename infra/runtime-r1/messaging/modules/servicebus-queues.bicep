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

var queueNamePairs = [for queueEntry in items(queueConfig): {
  key: queueEntry.key
  value: queueEntry.value.name
}]

var queueResourceIdPairs = [for (queueEntry, i) in items(queueConfig): {
  key: queueEntry.key
  value: queues[i].id
}]

output queueNames object = toObject(queueNamePairs, pair => pair.key, pair => pair.value)
output queueResourceIds object = toObject(queueResourceIdPairs, pair => pair.key, pair => pair.value)
