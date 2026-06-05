import type { AutonomyLevel } from "./autonomy";
import { DEPARTMENT_TEMPLATES } from "./catalog";

/**
 * Pure builder for the standard department + agent seed applied when a company
 * is created. Ordered (Code first); the data layer inserts these per company.
 */
export type AgentSeed = {
  key: string;
  name: string;
  role: string;
  position: number;
};

export type DepartmentSeed = {
  key: string;
  name: string;
  description: string;
  autonomy_level: AutonomyLevel;
  position: number;
  agents: AgentSeed[];
};

export function buildStandardDepartmentSeed(): DepartmentSeed[] {
  return DEPARTMENT_TEMPLATES.map((dept, deptIndex) => ({
    key: dept.key,
    name: dept.name,
    description: dept.description,
    autonomy_level: dept.defaultAutonomy,
    position: deptIndex,
    agents: dept.agents.map((agent, agentIndex) => ({
      key: agent.key,
      name: agent.name,
      role: agent.role,
      position: agentIndex,
    })),
  }));
}
