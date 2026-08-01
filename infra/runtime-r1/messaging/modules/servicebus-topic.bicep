targetScope = 'resourceGroup'

param namespaceName string
param topicName string
param defaultMessageTimeToLive string
param duplicateDetectionHistoryTimeWindow string
param requiresDuplicateDetection bool
param enablePartitioning bool
param maxSizeInMegabytes int
param subscriptions object

resource namespace 'Microsoft.ServiceBus/namespaces@2023-01-01-preview' existing = {
  name: namespaceName
}

resource topic 'Microsoft.ServiceBus/namespaces/topics@2023-01-01-preview' = {
  name: topicName
  parent: namespace
  properties: {
    defaultMessageTimeToLive: defaultMessageTimeToLive
    duplicateDetectionHistoryTimeWindow: duplicateDetectionHistoryTimeWindow
    requiresDuplicateDetection: requiresDuplicateDetection
    enablePartitioning: enablePartitioning
    maxSizeInMegabytes: maxSizeInMegabytes
    status: 'Active'
  }
}

resource topicSubscriptions 'Microsoft.ServiceBus/namespaces/topics/subscriptions@2023-01-01-preview' = [for sub in items(subscriptions): {
  name: sub.value.name
  parent: topic
  properties: {
    lockDuration: sub.value.lockDuration
    maxDeliveryCount: sub.value.maxDeliveryCount
    deadLetteringOnMessageExpiration: sub.value.deadLetteringOnMessageExpiration
    defaultMessageTimeToLive: sub.value.defaultMessageTimeToLive
    requiresSession: sub.value.requiresSession
    forwardDeadLetteredMessagesTo: empty(sub.value.forwardDeadLetteredMessagesTo) ? null : sub.value.forwardDeadLetteredMessagesTo
    status: 'Active'
  }
}]

output topicResourceId string = topic.id
output subscriptionNames array = [for sub in items(subscriptions): sub.value.name]
