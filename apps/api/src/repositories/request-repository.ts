import { randomUUID } from "node:crypto";

import type { Sql } from "postgres";

import type { PublishableArticle, RequirementDoc, WorkflowResult, WorkflowStatus } from "@lan-ting/workflow";

export interface RequestRecord {
  id: string;
  session_id: string;
  status: WorkflowStatus;
  requirement_doc: RequirementDoc;
  workflow_state: Record<string, unknown>;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface QueueRecord {
  id: string;
  request_id: string;
  article: PublishableArticle;
  review_status: string;
  review_notes: string | null;
  created_at: string;
  updated_at: string;
}

function mapRequestRow(row: Record<string, unknown>): RequestRecord {
  return {
    id: row.id as string,
    session_id: row.session_id as string,
    status: row.status as WorkflowStatus,
    requirement_doc: row.requirement_doc as RequirementDoc,
    workflow_state: row.workflow_state as Record<string, unknown>,
    error_message: (row.error_message as string | null) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string
  };
}

function mapQueueRow(row: Record<string, unknown>): QueueRecord {
  return {
    id: row.id as string,
    request_id: row.request_id as string,
    article: row.article as PublishableArticle,
    review_status: row.review_status as string,
    review_notes: (row.review_notes as string | null) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string
  };
}

export class RequestRepository {
  constructor(private readonly sql: Sql) {}

  async createRequest(sessionId: string, requirementDoc: RequirementDoc): Promise<RequestRecord> {
    await this.sql`
      insert into requests (id, session_id, status, requirement_doc, workflow_state)
      values (${requirementDoc.request_id}, ${sessionId}, ${"researching"}, ${this.sql.json(requirementDoc)}, ${this.sql.json({ requirement: requirementDoc })})
    `;

    const request = await this.getRequest(requirementDoc.request_id);
    if (!request) throw new Error("Failed to create request");
    return request;
  }

  async getRequest(requestId: string): Promise<RequestRecord | null> {
    const rows = await this.sql<Record<string, unknown>[]>`
      select
        id,
        session_id,
        status,
        requirement_doc,
        workflow_state,
        error_message,
        created_at::text,
        updated_at::text
      from requests
      where id = ${requestId}
      limit 1
    `;
    return rows[0] ? mapRequestRow(rows[0]) : null;
  }

  async updateWorkflowStatus(requestId: string, status: WorkflowStatus, workflowState: Record<string, unknown>): Promise<void> {
    const normalizedWorkflowState = JSON.parse(JSON.stringify(workflowState));
    await this.sql`
      update requests
      set status = ${status},
          workflow_state = ${this.sql.json(normalizedWorkflowState)},
          error_message = null,
          updated_at = now()
      where id = ${requestId}
    `;
  }

  async markFailed(requestId: string, errorMessage: string): Promise<void> {
    await this.sql`
      update requests
      set status = ${"failed"},
          error_message = ${errorMessage},
          updated_at = now()
      where id = ${requestId}
    `;
  }

  async persistWorkflowResult(requestId: string, result: WorkflowResult): Promise<void> {
    await this.updateWorkflowStatus(requestId, result.status, result as unknown as Record<string, unknown>);

    await this.sql`
      insert into article_versions (id, request_id, stage, payload)
      values
        (${randomUUID()}, ${requestId}, ${"draft"}, ${this.sql.json(result.draft)}),
        (${randomUUID()}, ${requestId}, ${"publishable"}, ${this.sql.json(result.publishable)})
    `;

    const queueId = randomUUID();
    await this.sql`
      insert into publish_queue (id, request_id, article, review_status)
      values (${queueId}, ${requestId}, ${this.sql.json(result.publishable)}, ${result.publishable.review_status})
      on conflict (request_id) do update
      set article = excluded.article,
          review_status = excluded.review_status,
          updated_at = now()
    `;
  }

  async listPublishQueue(): Promise<Array<QueueRecord & { request_status: string; topic: string }>> {
    const rows = await this.sql<Record<string, unknown>[]>`
      select
        pq.id,
        pq.request_id,
        pq.article,
        pq.review_status,
        pq.review_notes,
        pq.created_at::text,
        pq.updated_at::text,
        r.status as request_status,
        r.requirement_doc->>'topic' as topic
      from publish_queue pq
      inner join requests r on r.id = pq.request_id
      order by pq.updated_at desc
    `;

    return rows.map((row) => ({
      ...mapQueueRow(row),
      request_status: row.request_status as string,
      topic: row.topic as string
    }));
  }

  async reviewQueueItem(queueId: string, action: "approve" | "request_revision" | "reject", note?: string): Promise<QueueRecord | null> {
    const nextStatus =
      action === "approve" ? "approved" : action === "request_revision" ? "revision_requested" : "rejected";

    const queueRows = await this.sql<Record<string, unknown>[]>`
      update publish_queue
      set review_status = ${nextStatus},
          review_notes = ${note ?? null},
          updated_at = now()
      where id = ${queueId}
      returning id, request_id, article, review_status, review_notes, created_at::text, updated_at::text
    `;

    const queue = queueRows[0] ? mapQueueRow(queueRows[0]) : null;
    if (!queue) return null;

    await this.sql`
      insert into review_events (id, publish_queue_id, action, note)
      values (${randomUUID()}, ${queueId}, ${action}, ${note ?? null})
    `;

    await this.sql`
      update requests
      set status = ${nextStatus},
          updated_at = now()
      where id = ${queue.request_id}
    `;

    return queue;
  }
}
