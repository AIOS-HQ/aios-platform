targetScope = 'resourceGroup'

param location string
param workbookDisplayName string
param workspaceResourceId string
param appInsightsResourceId string
param tags object

resource workbook 'Microsoft.Insights/workbooks@2022-04-01' = {
  name: guid(resourceGroup().id, workbookDisplayName)
  location: location
  tags: tags
  kind: 'shared'
  properties: {
    category: 'workbook'
    displayName: workbookDisplayName
    serializedData: json(string({
      version: 'Notebook/1.0'
      items: [
        {
          type: 1
          content: {
            json: '## Runtime R1 Observability\n\nUse this workbook as the baseline for runtime, queue, agent, approval, and security operational views.'
          }
        }
      ]
      isLocked: false
      fallbackResourceIds: [
        workspaceResourceId
        appInsightsResourceId
      ]
    }))
    sourceId: workspaceResourceId
  }
}

output workbookResourceId string = workbook.id
