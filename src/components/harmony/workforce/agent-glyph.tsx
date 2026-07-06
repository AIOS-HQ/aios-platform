import { WorkerAvatar, type WorkerAvatarSize } from "@/components/workforce/worker-avatar";

export type AgentGlyphSize = WorkerAvatarSize;

/**
 * Canonical AI Workforce mark. Thin wrapper over WorkerAvatar so every existing
 * call site (Workforce directory, Julius, agent profiles, A2A activity, chat,
 * Command Center, Integration Center) renders the ONE unified colored gradient
 * worker avatar. API preserved (agent, size, className, title) so no call site
 * changes are required. WorkerAvatar's gradient is applied via inline style, so
 * it renders correctly even where callers pass legacy bg-* utility classes.
 */
export function AgentGlyph({
  agent,
  size = "md",
  className,
  title,
}: {
  agent: string;
  size?: AgentGlyphSize;
  className?: string;
  title?: string;
}) {
  return <WorkerAvatar agent={agent} size={size} className={className} title={title} />;
}
