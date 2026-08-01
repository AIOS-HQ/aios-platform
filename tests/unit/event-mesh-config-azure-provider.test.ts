import { describe, expect, it } from "vitest";

import { getEventMeshConfig } from "@/lib/event-mesh/config";

describe("event mesh azure provider config", () => {
  it("accepts azure-service-bus provider with namespace", () => {
    const config = getEventMeshConfig({
      AIOS_EVENT_MESH_PROVIDER: "azure-service-bus",
      AIOS_EVENT_MESH_AZURE_SERVICEBUS_NAMESPACE: "aios-r1-dev-sb",
      AIOS_EVENT_MESH_AZURE_SERVICEBUS_TOPIC: "aios-runtime-r1-events",
    });

    expect(config.provider).toBe("azure-service-bus");
    expect(config.azureServiceBus.namespace).toBe("aios-r1-dev-sb");
    expect(config.azureServiceBus.topicName).toBe("aios-runtime-r1-events");
  });

  it("requires namespace when provider is azure-service-bus", () => {
    expect(() =>
      getEventMeshConfig({
        AIOS_EVENT_MESH_PROVIDER: "azure-service-bus",
      }),
    ).toThrow("Missing required environment variable: AIOS_EVENT_MESH_AZURE_SERVICEBUS_NAMESPACE");
  });
});

