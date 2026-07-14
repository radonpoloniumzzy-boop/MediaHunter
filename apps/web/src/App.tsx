import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Navigate, NavLink, Route, Routes, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  Archive,
  Bell,
  BookOpen,
  Bot,
  Boxes,
  BriefcaseBusiness,
  CheckCircle2,
  CircleHelp,
  ClipboardList,
  Download,
  FileArchive,
  Flame,
  Gauge,
  Globe2,
  Home,
  LineChart,
  Loader2,
  MessageSquareText,
  PackagePlus,
  PanelRightOpen,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Sparkles,
  Target,
  Upload,
  UsersRound,
  X
} from "lucide-react";

import {
  type AnyRecord,
  type AuthUser,
  type DashboardSummary,
  type IncubationEntity,
  type ProjectDiscoveryRunDetail,
  type ProjectEvidenceItem,
  type ResearchProjectDetail,
  answerResearchProjectQuestion,
  confirmResearchProjectBrief,
  createResearchProject,
  downloadProjectEvidence,
  downloadExport,
  getResearchProject,
  getLatestProjectDiscovery,
  getDashboard,
  importEntity,
  listEntity,
  listResearchProjects,
  listProjectEvidence,
  login,
  logout,
  me,
  saveEntity,
  reviseResearchProjectBrief,
  retryProjectDiscovery,
  runProjectDiscovery,
  startResearchProject,
  suggestTopics,
  suggestTrackScore,
  updateProjectEvidence
} from "./api";
import type { LucideIcon } from "lucide-react";
import { getProjectActionState } from "./project-workspace-state";

const TOKEN_KEY = "incubation_token";
const fmtDate = (value?: unknown) => {
  if (typeof value !== "string" || !value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN");
};
const display = (value: unknown, fallback = "-") => {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "boolean") return value ? "是" : "否";
  if (Array.isArray(value)) return value.join(" / ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
};
const num = (value: unknown) => Number(value ?? 0) || 0;
const caughtMessage = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback);

type RelationKind = "platform" | "track" | "benchmark" | "content" | "ownedAccount";
type Field = {
  key: string;
  label: string;
  type?: "text" | "number" | "textarea" | "select" | "relation";
  relation?: RelationKind;
  options?: Array<{ label: string; value: string }>;
  placeholder?: string;
  wide?: boolean;
};

type ModuleConfig = {
  entity: IncubationEntity;
  route: string;
  navLabel: string;
  title: string;
  description: string;
  primaryAction: string;
  icon: LucideIcon;
  fields: Field[];
  columns: Array<{ key: string; label: string; tone?: "status" | "number" }>;
  detailFields: Array<{ key: string; label: string }>;
  importTemplate: string;
  metrics: Array<{ label: string; get: (rows: AnyRecord[]) => unknown }>;
  actions: string[];
};

type ReferenceData = {
  platforms: AnyRecord[];
  tracks: AnyRecord[];
  benchmarks: AnyRecord[];
  content: AnyRecord[];
  ownedAccounts: AnyRecord[];
};

const statusLabels: Record<string, string> = {
  active: "活跃",
  paused: "已暂停",
  observing: "观察中",
  pending: "待执行",
  running: "执行中",
  success: "成功",
  failed: "失败",
  cancelled: "已取消",
  waiting_manual: "待人工处理",
  pending_review: "待审核",
  approved: "已通过",
  assigned: "已分配",
  producing: "制作中",
  published: "已发布",
  reviewed: "已复盘",
  discarded: "已废弃",
  low: "低",
  medium: "中",
  high: "高",
  unknown: "未知"
};

const platformOptions = ["小红书", "抖音", "B站", "微信公众号", "快手", "视频号"].map((value) => ({ label: value, value }));
const riskOptions = [
  { label: "低风险", value: "low" },
  { label: "中风险", value: "medium" },
  { label: "高风险", value: "high" }
];
const statusOptions = ["active", "paused"].map((value) => ({ label: statusLabels[value], value }));

const MODULES: ModuleConfig[] = [
  {
    entity: "tracks",
    route: "/tracks",
    navLabel: "赛道管理",
    title: "赛道管理",
    description: "评估赛道价值，绑定关键词、信息源和后续内容资产。",
    primaryAction: "保存赛道",
    icon: Target,
    fields: [
      { key: "name", label: "赛道名称", placeholder: "AI 工具 / 职场成长" },
      { key: "category", label: "一级类目" },
      { key: "primary_platform_id", label: "主平台", type: "relation", relation: "platform" },
      { key: "target_user", label: "目标人群" },
      { key: "core_need", label: "核心需求", type: "textarea", wide: true },
      { key: "monetization_path", label: "变现路径" },
      {
        key: "content_supply_difficulty",
        label: "供给难度",
        type: "select",
        options: [
          { label: "低", value: "low" },
          { label: "中", value: "medium" },
          { label: "高", value: "high" }
        ]
      },
      { key: "compliance_risk_level", label: "合规风险", type: "select", options: riskOptions },
      {
        key: "status",
        label: "状态",
        type: "select",
        options: ["观察中", "小规模测试", "重点孵化", "暂不做"].map((value) => ({ label: value, value }))
      },
      { key: "notes", label: "备注", type: "textarea", wide: true }
    ],
    columns: [
      { key: "name", label: "赛道" },
      { key: "category", label: "类目" },
      { key: "total_score", label: "评分", tone: "number" },
      { key: "status", label: "状态", tone: "status" },
      { key: "updated_at", label: "更新" }
    ],
    detailFields: [
      { key: "target_user", label: "目标人群" },
      { key: "core_need", label: "核心需求" },
      { key: "monetization_path", label: "变现路径" },
      { key: "market_demand_score", label: "市场需求" },
      { key: "monetization_score", label: "变现能力" },
      { key: "content_supply_score", label: "内容供给" },
      { key: "benchmark_copy_score", label: "对标可复制" },
      { key: "platform_fit_score", label: "平台适配" },
      { key: "compliance_risk_score", label: "合规风险分" },
      { key: "notes", label: "备注" }
    ],
    importTemplate:
      "name,category,primary_platform_id,target_user,core_need,monetization_path,content_supply_difficulty,compliance_risk_level,status\nAI工具,效率工具,小红书,内容团队,批量生成与复盘,SaaS订阅,low,low,小规模测试",
    metrics: [
      { label: "赛道总数", get: (rows) => rows.length },
      { label: "平均评分", get: (rows) => average(rows.map((row) => num(row.total_score))).toFixed(2) },
      { label: "重点孵化", get: (rows) => rows.filter((row) => display(row.status).includes("重点")).length }
    ],
    actions: ["生成赛道评分", "查看关键词", "创建信息源"]
  },
  {
    entity: "keywords",
    route: "/keywords",
    navLabel: "关键词管理",
    title: "关键词管理",
    description: "围绕赛道维护搜索词、热点词和对标词，作为采集任务入口。",
    primaryAction: "保存关键词",
    icon: Search,
    fields: [
      { key: "keyword", label: "关键词" },
      { key: "track_id", label: "所属赛道", type: "relation", relation: "track" },
      { key: "platform_id", label: "平台", type: "relation", relation: "platform" },
      {
        key: "keyword_type",
        label: "类型",
        type: "select",
        options: [
          { label: "种子词", value: "seed" },
          { label: "热点词", value: "hot" },
          { label: "对标词", value: "competitor" },
          { label: "排除词", value: "negative" }
        ]
      },
      { key: "status", label: "状态", type: "select", options: statusOptions },
      { key: "notes", label: "备注", type: "textarea", wide: true }
    ],
    columns: [
      { key: "keyword", label: "关键词" },
      { key: "track_id", label: "赛道" },
      { key: "platform_id", label: "平台" },
      { key: "keyword_type", label: "类型" },
      { key: "status", label: "状态", tone: "status" }
    ],
    detailFields: [
      { key: "keyword", label: "关键词" },
      { key: "track_id", label: "所属赛道" },
      { key: "platform_id", label: "平台" },
      { key: "notes", label: "备注" }
    ],
    importTemplate: "keyword,track,platform,keyword_type,status\nAI提效,AI工具,小红书,seed,active",
    metrics: [
      { label: "关键词数", get: (rows) => rows.length },
      { label: "活跃关键词", get: (rows) => rows.filter((row) => row.status === "active").length },
      { label: "热点词", get: (rows) => rows.filter((row) => row.keyword_type === "hot").length }
    ],
    actions: ["创建采集任务", "关联信息源", "查看内容样本"]
  },
  {
    entity: "information-sources",
    route: "/sources",
    navLabel: "信息源",
    title: "信息源与热点雷达",
    description: "管理公告、账号、关键词和人工热点来源，留痕采集频率与健康状态。",
    primaryAction: "保存信息源",
    icon: Globe2,
    fields: [
      { key: "name", label: "信息源名称" },
      {
        key: "source_type",
        label: "来源类型",
        type: "select",
        options: ["rss", "web", "account", "keyword", "github", "platform_notice", "manual"].map((value) => ({ label: value, value }))
      },
      { key: "platform_id", label: "平台", type: "relation", relation: "platform" },
      { key: "track_id", label: "赛道", type: "relation", relation: "track" },
      { key: "url", label: "来源地址", wide: true },
      { key: "frequency_minutes", label: "频率分钟", type: "number" },
      { key: "importance", label: "重要级别", type: "select", options: ["A", "B", "C"].map((value) => ({ label: value, value })) },
      { key: "status", label: "状态", type: "select", options: statusOptions },
      { key: "last_error", label: "最近错误", type: "textarea", wide: true }
    ],
    columns: [
      { key: "name", label: "信息源" },
      { key: "source_type", label: "类型" },
      { key: "platform_id", label: "平台" },
      { key: "track_id", label: "赛道" },
      { key: "importance", label: "级别" },
      { key: "status", label: "状态", tone: "status" }
    ],
    detailFields: [
      { key: "url", label: "来源地址" },
      { key: "frequency_minutes", label: "执行频率" },
      { key: "last_success_at", label: "最近成功" },
      { key: "last_error", label: "最近错误" },
      { key: "notes", label: "备注" }
    ],
    importTemplate: "name,source_type,platform,track,url,frequency_minutes,importance,status\n平台公告,rss,小红书,AI工具,https://example.com/rss,1440,A,active",
    metrics: [
      { label: "信息源数", get: (rows) => rows.length },
      { label: "活跃源", get: (rows) => rows.filter((row) => row.status === "active").length },
      { label: "A级源", get: (rows) => rows.filter((row) => row.importance === "A").length }
    ],
    actions: ["创建采集任务", "转为热点", "查看任务日志"]
  },
  {
    entity: "tasks",
    route: "/tasks",
    navLabel: "采集任务",
    title: "采集任务与执行日志",
    description: "配置采集壳任务，查看失败原因、原始日志和人工处理状态。",
    primaryAction: "保存任务",
    icon: ClipboardList,
    fields: [
      { key: "task_name", label: "任务名称" },
      {
        key: "task_type",
        label: "任务类型",
        type: "select",
        options: ["manual_import", "rss_pull", "keyword_collect", "failed_retry"].map((value) => ({ label: value, value }))
      },
      { key: "entity_type", label: "目标对象" },
      { key: "track_id", label: "关联赛道", type: "relation", relation: "track" },
      {
        key: "status",
        label: "状态",
        type: "select",
        options: ["pending", "running", "success", "failed", "paused", "waiting_manual"].map((value) => ({ label: statusLabels[value] ?? value, value }))
      },
      { key: "rate_limit_per_hour", label: "限频/小时", type: "number" },
      { key: "random_delay_seconds", label: "随机延迟秒", type: "number" },
      { key: "error_summary", label: "错误原因", type: "textarea", wide: true }
    ],
    columns: [
      { key: "task_name", label: "任务" },
      { key: "task_type", label: "类型" },
      { key: "track_id", label: "赛道" },
      { key: "status", label: "状态", tone: "status" },
      { key: "result_count", label: "结果", tone: "number" },
      { key: "updated_at", label: "更新" }
    ],
    detailFields: [
      { key: "entity_type", label: "目标对象" },
      { key: "source_count", label: "来源数" },
      { key: "item_count", label: "处理数" },
      { key: "result_count", label: "成功数" },
      { key: "rate_limit_per_hour", label: "限频" },
      { key: "random_delay_seconds", label: "随机延迟" },
      { key: "error_summary", label: "错误原因" },
      { key: "logs_json", label: "原始日志" }
    ],
    importTemplate: "task_name,task_type,entity_type,track,status,rate_limit_per_hour,random_delay_seconds,error_summary\n小红书关键词导入,manual_import,content-samples,AI工具,success,30,5,",
    metrics: [
      { label: "任务总数", get: (rows) => rows.length },
      { label: "异常任务", get: (rows) => rows.filter((row) => ["failed", "waiting_manual"].includes(String(row.status))).length },
      { label: "成功结果", get: (rows) => rows.reduce((sum, row) => sum + num(row.result_count), 0) }
    ],
    actions: ["手动执行", "暂停任务", "重试失败"]
  },
  {
    entity: "benchmark-accounts",
    route: "/benchmarks",
    navLabel: "对标账号",
    title: "对标账号库",
    description: "拆解对标账号的内容线、爆款率、可复制点和不可复制点。",
    primaryAction: "保存对标账号",
    icon: UsersRound,
    fields: [
      { key: "name", label: "账号名称" },
      { key: "platform_id", label: "平台", type: "relation", relation: "platform" },
      { key: "track_id", label: "赛道", type: "relation", relation: "track" },
      { key: "url", label: "账号链接", wide: true },
      { key: "follower_count", label: "粉丝数", type: "number" },
      {
        key: "account_level",
        label: "层级",
        type: "select",
        options: ["头部", "腰部", "低粉爆款", "失败样本"].map((value) => ({ label: value, value }))
      },
      { key: "posts_30d", label: "30天发文", type: "number" },
      { key: "viral_posts_30d", label: "30天爆款", type: "number" },
      { key: "content_line", label: "内容主线" },
      { key: "copyable_points", label: "可复制点", type: "textarea", wide: true },
      { key: "noncopyable_points", label: "不可复制点", type: "textarea", wide: true }
    ],
    columns: [
      { key: "name", label: "账号" },
      { key: "platform_id", label: "平台" },
      { key: "track_id", label: "赛道" },
      { key: "follower_count", label: "粉丝", tone: "number" },
      { key: "viral_rate", label: "爆款率", tone: "number" }
    ],
    detailFields: [
      { key: "url", label: "账号链接" },
      { key: "content_line", label: "内容主线" },
      { key: "title_structure", label: "标题结构" },
      { key: "cover_structure", label: "封面结构" },
      { key: "script_structure", label: "脚本结构" },
      { key: "comment_questions", label: "高频评论" },
      { key: "monetization_path", label: "变现路径" },
      { key: "copyable_points", label: "可复制点" },
      { key: "noncopyable_points", label: "不可复制点" }
    ],
    importTemplate:
      "account_name,platform,track,account_url,follower_count,level,content_line,replicable_points,status\nAI工具研究所,小红书,AI工具,https://example.com/user/123,8500,腰部,AI工具测评,标题结构清晰,active",
    metrics: [
      { label: "对标账号", get: (rows) => rows.length },
      { label: "低粉爆款", get: (rows) => rows.filter((row) => row.account_level === "低粉爆款").length },
      { label: "平均爆款率", get: (rows) => average(rows.map((row) => num(row.viral_rate) * 100)).toFixed(1) + "%" }
    ],
    actions: ["查看内容样本", "生成对标分析", "加入重点监控"]
  },
  {
    entity: "content-samples",
    route: "/content",
    navLabel: "内容样本",
    title: "爆款内容库",
    description: "沉淀可拆解内容，识别低粉爆款并转化为选题候选。",
    primaryAction: "保存内容样本",
    icon: Flame,
    fields: [
      { key: "title", label: "内容标题", wide: true },
      { key: "platform_id", label: "平台", type: "relation", relation: "platform" },
      { key: "track_id", label: "赛道", type: "relation", relation: "track" },
      { key: "benchmark_account_id", label: "来源账号", type: "relation", relation: "benchmark" },
      { key: "original_url", label: "原始链接", wide: true },
      { key: "author_name", label: "作者" },
      { key: "content_type", label: "形式", type: "select", options: ["图文", "视频", "直播切片", "长视频"].map((value) => ({ label: value, value })) },
      { key: "likes", label: "点赞", type: "number" },
      { key: "collects", label: "收藏", type: "number" },
      { key: "comments", label: "评论", type: "number" },
      { key: "shares", label: "分享", type: "number" },
      { key: "plays", label: "播放", type: "number" },
      { key: "follower_count", label: "粉丝", type: "number" },
      { key: "hook", label: "开头钩子", type: "textarea", wide: true }
    ],
    columns: [
      { key: "title", label: "标题" },
      { key: "platform_id", label: "平台" },
      { key: "track_id", label: "赛道" },
      { key: "author_name", label: "作者" },
      { key: "interaction_rate", label: "互动率", tone: "number" },
      { key: "is_low_follower_viral", label: "低粉爆款", tone: "status" }
    ],
    detailFields: [
      { key: "original_url", label: "原始链接" },
      { key: "likes", label: "点赞" },
      { key: "collects", label: "收藏" },
      { key: "comments", label: "评论" },
      { key: "shares", label: "分享" },
      { key: "plays", label: "播放" },
      { key: "title_structure", label: "标题结构" },
      { key: "hook", label: "开头钩子" },
      { key: "cover_type", label: "封面类型" },
      { key: "script_structure", label: "脚本结构" },
      { key: "comment_need_summary", label: "评论需求" },
      { key: "copy_level", label: "可复制等级" },
      { key: "risk_level", label: "风险等级" }
    ],
    importTemplate:
      "title,platform,track,original_url,author,content_type,likes,collects,comments,shares,views,publish_time\n3个AI工具提升效率,小红书,AI工具,https://example.com/note/123,AI工具研究所,图文,12000,5000,680,300,0,2025-05-25",
    metrics: [
      { label: "内容样本", get: (rows) => rows.length },
      { label: "爆款样本", get: (rows) => rows.filter((row) => row.is_viral).length },
      { label: "低粉爆款", get: (rows) => rows.filter((row) => row.is_low_follower_viral).length }
    ],
    actions: ["生成选题", "加入素材库", "查看评论需求"]
  },
  {
    entity: "comments",
    route: "/comments",
    navLabel: "评论需求",
    title: "评论需求库",
    description: "把评论转化为需求资产，按意图强度、情绪和聚类推动选题。",
    primaryAction: "保存评论",
    icon: MessageSquareText,
    fields: [
      { key: "comment_text", label: "评论内容", type: "textarea", wide: true },
      { key: "content_sample_id", label: "来源内容", type: "relation", relation: "content" },
      { key: "platform_id", label: "平台", type: "relation", relation: "platform" },
      { key: "track_id", label: "赛道", type: "relation", relation: "track" },
      { key: "source_account", label: "来源账号" },
      { key: "source_url", label: "来源链接", wide: true },
      { key: "like_count", label: "点赞数", type: "number" }
    ],
    columns: [
      { key: "comment_text", label: "评论" },
      { key: "need_type", label: "需求类型" },
      { key: "sentiment", label: "情绪", tone: "status" },
      { key: "intent_score", label: "意图强度", tone: "number" },
      { key: "cluster_key", label: "聚类" }
    ],
    detailFields: [
      { key: "source_url", label: "来源链接" },
      { key: "source_account", label: "来源账号" },
      { key: "like_count", label: "点赞数" },
      { key: "can_convert_topic", label: "可转选题" },
      { key: "can_convert_faq", label: "可转 FAQ" },
      { key: "can_convert_script", label: "可转话术" }
    ],
    importTemplate:
      "comment_text,platform,track,source_url,like_count,need_type,sentiment,intent_score\n新手怎么开始做账号定位？,小红书,账号运营,https://example.com/note/123,128,求教程,neutral,85",
    metrics: [
      { label: "评论需求", get: (rows) => rows.length },
      { label: "高意图", get: (rows) => rows.filter((row) => num(row.intent_score) >= 70).length },
      { label: "可转选题", get: (rows) => rows.filter((row) => row.can_convert_topic !== false).length }
    ],
    actions: ["一键转选题", "生成 FAQ", "查看来源内容"]
  },
  {
    entity: "topics",
    route: "/topics",
    navLabel: "选题库",
    title: "中央选题库",
    description: "承接热点、爆款和评论需求，统一审核、分配和推进制作。",
    primaryAction: "保存选题",
    icon: Sparkles,
    fields: [
      { key: "title", label: "选题标题", wide: true },
      { key: "track_id", label: "赛道", type: "relation", relation: "track" },
      { key: "target_account", label: "目标账号" },
      { key: "target_audience", label: "目标人群" },
      { key: "pain_point", label: "用户痛点", type: "textarea", wide: true },
      { key: "content_format", label: "内容形式" },
      {
        key: "topic_type",
        label: "选题类型",
        type: "select",
        options: [
          { label: "爆款复刻", value: "viral_remix" },
          { label: "评论需求", value: "comment_need" },
          { label: "热点响应", value: "hot_response" },
          { label: "人工", value: "manual" }
        ]
      },
      { key: "priority", label: "优先级", type: "select", options: ["A", "B", "C"].map((value) => ({ label: value, value })) },
      { key: "difficulty", label: "制作难度", type: "select", options: ["low", "medium", "high"].map((value) => ({ label: statusLabels[value], value })) },
      { key: "risk_level", label: "风险等级", type: "select", options: riskOptions },
      {
        key: "status",
        label: "状态",
        type: "select",
        options: ["pending_review", "approved", "assigned", "producing", "published", "reviewed", "discarded"].map((value) => ({ label: statusLabels[value], value }))
      }
    ],
    columns: [
      { key: "title", label: "选题" },
      { key: "track_id", label: "赛道" },
      { key: "topic_type", label: "类型" },
      { key: "priority", label: "优先级", tone: "status" },
      { key: "status", label: "状态", tone: "status" }
    ],
    detailFields: [
      { key: "suggestion_reason", label: "来源说明" },
      { key: "content_sample_id", label: "来源内容" },
      { key: "comment_need_id", label: "来源评论" },
      { key: "target_account", label: "目标账号" },
      { key: "target_audience", label: "目标人群" },
      { key: "content_format", label: "内容形式" },
      { key: "source_trace", label: "来源追溯" }
    ],
    importTemplate:
      "title,track,platform_targets,topic_type,target_user,pain_point,priority,status,source_url\n新手如何做账号定位？,账号运营,小红书|抖音,comment_need,新手运营,不会定位,A,pending_review,https://example.com/note/123",
    metrics: [
      { label: "选题总数", get: (rows) => rows.length },
      { label: "待审核", get: (rows) => rows.filter((row) => row.status === "pending_review").length },
      { label: "A级选题", get: (rows) => rows.filter((row) => row.priority === "A").length }
    ],
    actions: ["生成平台版本", "分配给账号", "转生产任务"]
  },
  {
    entity: "owned-accounts",
    route: "/owned-accounts",
    navLabel: "账号资产",
    title: "账号资产库",
    description: "管理我方账号阶段、负责人、内容线、等级和立项卡完整度。",
    primaryAction: "保存账号",
    icon: BriefcaseBusiness,
    fields: [
      { key: "name", label: "账号名称" },
      { key: "platform_id", label: "平台", type: "relation", relation: "platform" },
      { key: "account_url", label: "账号链接", wide: true },
      {
        key: "account_type",
        label: "账号类型",
        type: "select",
        options: ["IP号", "带货号", "矩阵号", "本地生活号", "知识号", "素材号"].map((value) => ({ label: value, value }))
      },
      { key: "track_id", label: "所属赛道", type: "relation", relation: "track" },
      { key: "content_line", label: "内容线" },
      { key: "owner_name", label: "负责人" },
      {
        key: "stage",
        label: "当前阶段",
        type: "select",
        options: ["立项", "起号", "测试", "放大", "稳定", "暂停", "淘汰"].map((value) => ({ label: value, value }))
      },
      { key: "follower_count", label: "粉丝数", type: "number" },
      { key: "posts_7d", label: "7天发布", type: "number" },
      { key: "growth_30d", label: "30天涨粉", type: "number" },
      { key: "viral_posts_30d", label: "30天爆款", type: "number" },
      { key: "account_level", label: "账号等级", type: "select", options: ["S", "A", "B", "C", "D"].map((value) => ({ label: value, value })) },
      { key: "risk_status", label: "风险状态", type: "select", options: riskOptions },
      { key: "notes", label: "立项卡摘要", type: "textarea", wide: true }
    ],
    columns: [
      { key: "name", label: "账号" },
      { key: "platform_id", label: "平台" },
      { key: "track_id", label: "赛道" },
      { key: "stage", label: "阶段", tone: "status" },
      { key: "account_level", label: "等级", tone: "status" },
      { key: "follower_count", label: "粉丝", tone: "number" }
    ],
    detailFields: [
      { key: "account_url", label: "账号链接" },
      { key: "account_type", label: "账号类型" },
      { key: "content_line", label: "内容线" },
      { key: "owner_name", label: "负责人" },
      { key: "posts_7d", label: "7天发布" },
      { key: "growth_30d", label: "30天涨粉" },
      { key: "viral_posts_30d", label: "30天爆款" },
      { key: "risk_status", label: "风险状态" },
      { key: "notes", label: "立项卡摘要" }
    ],
    importTemplate:
      "name,platform,account_url,account_type,track,content_line,owner_name,stage,follower_count,posts_7d,growth_30d,viral_posts_30d,account_level,risk_status\nAI效率号,小红书,https://example.com/account,知识号,AI工具,AI工具教程,运营A,立项,0,0,0,0,C,low",
    metrics: [
      { label: "账号资产", get: (rows) => rows.length },
      { label: "放大中", get: (rows) => rows.filter((row) => row.stage === "放大").length },
      { label: "S/A 等级", get: (rows) => rows.filter((row) => ["S", "A"].includes(String(row.account_level))).length }
    ],
    actions: ["编辑立项卡", "分配选题", "查看素材"]
  },
  {
    entity: "materials",
    route: "/materials",
    navLabel: "素材库",
    title: "素材 / 文件库",
    description: "管理图片、视频、封面、评论截图和脚本文档，保留来源与版权状态。",
    primaryAction: "保存素材",
    icon: FileArchive,
    fields: [
      { key: "name", label: "素材名称" },
      {
        key: "asset_type",
        label: "素材类型",
        type: "select",
        options: ["图片", "视频", "音频", "文档", "评论截图", "封面", "B-roll", "产品素材"].map((value) => ({ label: value, value }))
      },
      { key: "file_url", label: "文件地址", wide: true },
      { key: "preview_url", label: "预览图", wide: true },
      { key: "source_platform_id", label: "来源平台", type: "relation", relation: "platform" },
      { key: "source_url", label: "来源链接", wide: true },
      { key: "source_account", label: "来源账号" },
      { key: "uploader_name", label: "上传人" },
      { key: "track_id", label: "所属赛道", type: "relation", relation: "track" },
      { key: "owned_account_id", label: "所属账号", type: "relation", relation: "ownedAccount" },
      { key: "tags", label: "标签" },
      { key: "is_original", label: "是否原创", type: "select", options: yesNoOptions() },
      { key: "is_commercial_allowed", label: "可商用", type: "select", options: yesNoOptions() },
      { key: "copyright_status", label: "版权状态" },
      { key: "risk_level", label: "风险等级", type: "select", options: riskOptions },
      { key: "notes", label: "备注", type: "textarea", wide: true }
    ],
    columns: [
      { key: "name", label: "素材" },
      { key: "asset_type", label: "类型" },
      { key: "track_id", label: "赛道" },
      { key: "source_account", label: "来源账号" },
      { key: "copyright_status", label: "版权" },
      { key: "risk_level", label: "风险", tone: "status" }
    ],
    detailFields: [
      { key: "file_url", label: "文件地址" },
      { key: "preview_url", label: "预览图" },
      { key: "source_url", label: "来源链接" },
      { key: "tags", label: "标签" },
      { key: "is_original", label: "原创" },
      { key: "is_commercial_allowed", label: "可商用" },
      { key: "file_hash", label: "文件哈希" },
      { key: "notes", label: "备注" }
    ],
    importTemplate:
      "name,asset_type,file_url,source_platform,source_url,source_account,track,owned_account,tags,is_original,is_commercial_allowed,copyright_status,risk_level\nAI工具封面模板,封面,D:/materials/cover.png,小红书,https://example.com/note,AI工具研究所,AI工具,AI效率号,封面|工具,false,true,authorized,low",
    metrics: [
      { label: "素材总数", get: (rows) => rows.length },
      { label: "可商用", get: (rows) => rows.filter((row) => row.is_commercial_allowed).length },
      { label: "高风险", get: (rows) => rows.filter((row) => row.risk_level === "high").length }
    ],
    actions: ["上传素材", "导出清单", "查重"]
  }
];

function yesNoOptions() {
  return [
    { label: "是", value: "true" },
    { label: "否", value: "false" }
  ];
}

function average(values: number[]) {
  const valid = values.filter((value) => Number.isFinite(value));
  if (!valid.length) return 0;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function moduleByEntity(entity: IncubationEntity) {
  const found = MODULES.find((module) => module.entity === entity);
  if (!found) throw new Error(`Missing module config for ${entity}`);
  return found;
}

function App() {
  const [token, setToken] = useState<string | null>(() => window.localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState<AuthUser | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    async function bootstrap() {
      if (!token) {
        setChecking(false);
        return;
      }
      try {
        setUser((await me(token)).user);
      } catch {
        window.localStorage.removeItem(TOKEN_KEY);
        setToken(null);
      } finally {
        setChecking(false);
      }
    }
    void bootstrap();
  }, [token]);

  if (checking) return <LoadingScreen label="正在连接账号孵化系统" />;
  if (!token || !user) {
    return (
      <LoginPage
        onLogin={(nextToken, nextUser) => {
          window.localStorage.setItem(TOKEN_KEY, nextToken);
          setToken(nextToken);
          setUser(nextUser);
        }}
      />
    );
  }

  return (
    <Shell
      user={user}
      onLogout={async () => {
        try {
          await logout(token);
        } catch {
          // Keep logout resilient when the API has already been stopped.
        }
        window.localStorage.removeItem(TOKEN_KEY);
        setToken(null);
        setUser(null);
      }}
    >
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage token={token} />} />
        <Route path="/research-projects" element={<ResearchProjectsPage token={token} />} />
        {MODULES.map((module) => (
          <Route key={module.route} path={module.route} element={<ModulePage token={token} config={module} />} />
        ))}
        <Route path="/exports" element={<ExportsPage token={token} />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Shell>
  );
}

function LoadingScreen({ label }: { label: string }) {
  return (
    <div className="screen-center">
      <div className="loading-box">
        <Loader2 className="spin" size={22} />
        <span>{label}</span>
      </div>
    </div>
  );
}

function LoginPage({ onLogin }: { onLogin: (token: string, user: AuthUser) => void }) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("Changeme123!");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  return (
    <div className="screen-center login-bg">
      <form
        className="auth-panel"
        onSubmit={async (event) => {
          event.preventDefault();
          try {
            setLoading(true);
            setError(null);
            const result = await login(username, password);
            onLogin(result.token, result.user);
          } catch (caught) {
            setError(caughtMessage(caught, "登录失败"));
          } finally {
            setLoading(false);
          }
        }}
      >
        <div className="auth-logo">
          <div className="logo-mark">M</div>
          <div>
            <p>MCN OS</p>
            <h1>账号孵化 2.0</h1>
          </div>
        </div>
        <label>
          用户名
          <input value={username} onChange={(event) => setUsername(event.target.value)} />
        </label>
        <label>
          密码
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
        </label>
        {error ? <p className="error-text">{error}</p> : null}
        <button className="primary-button" disabled={loading}>
          {loading ? "登录中..." : "登录工作台"}
        </button>
      </form>
    </div>
  );
}

function Shell({ user, onLogout, children }: { user: AuthUser; onLogout: () => void; children: ReactNode }) {
  const nav = [
    { to: "/dashboard", label: "Dashboard", icon: Home },
    { to: "/research-projects", label: "专项调研", icon: BriefcaseBusiness },
    ...MODULES.map((module) => ({ to: module.route, label: module.navLabel, icon: module.icon })),
    { to: "/exports", label: "导出中心", icon: Download },
    { to: "/settings", label: "系统设置", icon: Settings }
  ];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <p>MCN OS</p>
          <h1>账号孵化 2.0</h1>
        </div>
        <nav className="nav">
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}>
              <Icon size={17} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="user-block">
          <div className="avatar">{user.display_name.slice(0, 1)}</div>
          <div>
            <strong>{user.display_name}</strong>
            <span>{user.roles.join(" / ")}</span>
          </div>
          <button className="icon-button quiet" onClick={onLogout} title="退出登录" aria-label="退出登录">
            <X size={16} />
          </button>
        </div>
      </aside>
      <main className="main-panel">
        <TopBar />
        {children}
      </main>
    </div>
  );
}

function TopBar() {
  const navigate = useNavigate();
  return (
    <header className="topbar">
      <div className="global-search">
        <Search size={17} />
        <input placeholder="搜索赛道、关键词、选题或账号..." />
        <kbd>⌘ K</kbd>
      </div>
      <div className="topbar-actions">
        <button className="icon-button" title="通知中心" aria-label="通知中心">
          <Bell size={18} />
          <span className="dot-badge">12</span>
        </button>
        <button className="icon-button" title="帮助" aria-label="帮助">
          <CircleHelp size={18} />
        </button>
        <button className="primary-button compact" onClick={() => navigate("/tasks")}>
          <Plus size={16} />
          新建任务
        </button>
      </div>
    </header>
  );
}

function useEntityList(token: string, entity: IncubationEntity, filters: Record<string, string | number | undefined> = {}) {
  const [items, setItems] = useState<AnyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const filterKey = JSON.stringify(filters);

  async function refresh() {
    try {
      setLoading(true);
      setError(null);
      setItems((await listEntity(token, entity, filters)).items);
    } catch (caught) {
      setError(caughtMessage(caught, "加载失败"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, [token, entity, filterKey]);

  return { items, loading, error, refresh };
}

function useReferenceData(token: string) {
  const [data, setData] = useState<ReferenceData>({ platforms: [], tracks: [], benchmarks: [], content: [], ownedAccounts: [] });

  useEffect(() => {
    let active = true;
    async function load() {
      const [platforms, tracks, benchmarks, content, ownedAccounts] = await Promise.all([
        listEntity(token, "platforms"),
        listEntity(token, "tracks"),
        listEntity(token, "benchmark-accounts"),
        listEntity(token, "content-samples"),
        listEntity(token, "owned-accounts")
      ]);
      if (active) {
        setData({
          platforms: platforms.items,
          tracks: tracks.items,
          benchmarks: benchmarks.items,
          content: content.items,
          ownedAccounts: ownedAccounts.items
        });
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [token]);

  return data;
}

function DashboardPage({ token }: { token: string }) {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState("2025-05-18 ~ 2025-05-25");
  const refs = useReferenceData(token);
  const content = useEntityList(token, "content-samples", { limit: 8 });
  const comments = useEntityList(token, "comments", { limit: 10 });
  const topics = useEntityList(token, "topics", { limit: 8 });
  const tasks = useEntityList(token, "tasks", { limit: 8 });

  useEffect(() => {
    void getDashboard(token)
      .then(setSummary)
      .catch((caught) => setError(caughtMessage(caught, "Dashboard 加载失败")));
  }, [token]);

  if (error) return <Notice tone="error">{error}</Notice>;
  if (!summary) return <LoadingScreen label="正在加载运营总览" />;

  const alerts = tasks.items.filter((task) => ["failed", "waiting_manual"].includes(String(task.status)));
  const pendingTopics = topics.items.filter((topic) => topic.status === "pending_review");
  const lowFollowerViral = content.items.filter((item) => item.is_low_follower_viral || item.is_viral);

  return (
    <div className="page-stack">
      <header className="hero-header">
        <div>
          <h1>运营总览</h1>
          <p>上午好，管理员。以下是账号孵化的关键数据概览。</p>
        </div>
        <div className="filter-row">
          <select value={range} onChange={(event) => setRange(event.target.value)}>
            <option>2025-05-18 ~ 2025-05-25</option>
            <option>最近 7 天</option>
            <option>最近 30 天</option>
          </select>
          <select>
            <option>全部平台</option>
            {refs.platforms.map((platform) => (
              <option key={String(platform.id)}>{display(platform.name)}</option>
            ))}
          </select>
          <select>
            <option>全部赛道</option>
            {refs.tracks.map((track) => (
              <option key={String(track.id)}>{display(track.name)}</option>
            ))}
          </select>
        </div>
      </header>

      <section className="kpi-grid">
        <KpiCard icon={Target} label="赛道数" value={summary.tracks.total_tracks} delta="+8" />
        <KpiCard icon={Gauge} label="平均赛道分" value={summary.tracks.avg_track_score} delta="+5.2" />
        <KpiCard icon={Globe2} label="信息源" value={summary.assets.active_sources} delta="+12" />
        <KpiCard icon={UsersRound} label="对标账号" value={summary.assets.benchmark_accounts} delta="+22" />
        <KpiCard icon={BookOpen} label="内容样本" value={summary.assets.content_samples} delta="+48" />
        <KpiCard icon={Flame} label="爆款样本" value={summary.assets.viral_samples} delta="+15" />
        <KpiCard icon={MessageSquareText} label="评论需求" value={summary.assets.comment_needs} delta="+39" />
        <KpiCard icon={Sparkles} label="待审核选题" value={summary.assets.pending_topics ?? pendingTopics.length} delta="+10" />
      </section>

      <section className="dashboard-grid">
        <ActionPanel
          title="高优先级热点"
          icon={Flame}
          rows={lowFollowerViral.slice(0, 5)}
          empty="暂无爆款样本"
          render={(row, index) => (
            <ActionRow
              index={index + 1}
              title={display(row.title)}
              meta={display(resolveName(row.track_id, refs.tracks))}
              score={Math.round(num(row.interaction_rate) * 100)}
              tone="green"
            />
          )}
        />
        <ActionPanel
          title="新增低粉爆款"
          icon={LineChart}
          rows={lowFollowerViral.slice(0, 4)}
          empty="暂无低粉爆款"
          render={(row) => (
            <div className="viral-row">
              <div className="thumb">{display(row.author_name).slice(0, 1)}</div>
              <div>
                <strong>{display(row.title)}</strong>
                <span>{display(row.author_name)} · 粉丝 {display(row.follower_count, "0")}</span>
              </div>
              <MiniSparkline tone="pink" />
            </div>
          )}
        />
        <ActionPanel
          title="评论需求 Top 10"
          icon={MessageSquareText}
          rows={comments.items.slice(0, 5)}
          empty="暂无评论需求"
          render={(row, index) => <ActionRow index={index + 1} title={display(row.comment_text)} meta={display(row.need_type)} score={num(row.intent_score)} tone="amber" />}
        />
        <ActionPanel
          title="待审核选题"
          icon={Sparkles}
          rows={pendingTopics.slice(0, 5)}
          empty="暂无待审核选题"
          render={(row, index) => <ActionRow index={index + 1} title={display(row.title)} meta={display(row.topic_type)} score={display(row.priority)} tone="blue" />}
        />
        <ActionPanel
          title="采集任务异常"
          icon={AlertTriangle}
          rows={alerts.slice(0, 5)}
          empty="暂无异常任务"
          render={(row, index) => <ActionRow index={index + 1} title={display(row.task_name)} meta={display(row.error_summary, "等待处理")} score={statusLabels[String(row.status)] ?? display(row.status)} tone="red" />}
        />
        <ActionPanel
          title="推荐加码赛道"
          icon={Target}
          rows={summary.top_tracks}
          empty="暂无赛道评分"
          render={(row, index) => <ActionRow index={index + 1} title={display(row.name)} meta={display(row.status)} score={display(row.total_score)} tone="green" />}
        />
      </section>

      <section className="panel trend-panel">
        <div>
          <h2>内容趋势</h2>
          <p>近 7 天样本、评论需求、爆款和选题转化的模拟趋势。</p>
        </div>
        <div className="trend-lines" aria-hidden="true">
          <MiniSparkline tone="blue" large />
          <MiniSparkline tone="green" large />
          <MiniSparkline tone="pink" large />
        </div>
      </section>
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, delta }: { icon: LucideIcon; label: string; value: unknown; delta: string }) {
  return (
    <article className="kpi-card">
      <div className="kpi-icon">
        <Icon size={20} />
      </div>
      <span>{label}</span>
      <strong>{display(value, "0")}</strong>
      <small>较上周 {delta} ↗</small>
    </article>
  );
}

function ActionPanel({
  title,
  icon: Icon,
  rows,
  empty,
  render
}: {
  title: string;
  icon: LucideIcon;
  rows: AnyRecord[];
  empty: string;
  render: (row: AnyRecord, index: number) => ReactNode;
}) {
  return (
    <section className="panel action-panel">
      <div className="section-title">
        <h2>
          <Icon size={18} />
          {title}
        </h2>
        <button className="link-button">查看全部</button>
      </div>
      <div className="action-list">{rows.length ? rows.map(render) : <p className="muted">{empty}</p>}</div>
    </section>
  );
}

function ActionRow({ index, title, meta, score, tone }: { index: number; title: string; meta: string; score: unknown; tone: "green" | "amber" | "blue" | "red" }) {
  return (
    <div className="action-row">
      <span className={`rank ${tone}`}>{index}</span>
      <strong>{title}</strong>
      <small>{meta}</small>
      <b>{display(score)}</b>
    </div>
  );
}

function MiniSparkline({ tone, large }: { tone: "blue" | "green" | "pink"; large?: boolean }) {
  return <span className={`sparkline ${tone} ${large ? "large" : ""}`} />;
}

function ModulePage({ token, config }: { token: string; config: ModuleConfig }) {
  const [filters, setFilters] = useState({ keyword: "", status: "" });
  const { items, loading, error, refresh } = useEntityList(token, config.entity, filters);
  const refs = useReferenceData(token);
  const [form, setForm] = useState<AnyRecord>({});
  const [importText, setImportText] = useState(config.importTemplate);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<AnyRecord | null>(null);

  async function submit() {
    setBusy(true);
    setMessage(null);
    try {
      await saveEntity(token, config.entity, form);
      setForm({});
      setMessage("已保存");
      await refresh();
    } catch (caught) {
      setMessage(caughtMessage(caught, "保存失败"));
    } finally {
      setBusy(false);
    }
  }

  async function runPrimaryAction(row: AnyRecord) {
    if (config.entity === "tracks") {
      await suggestTrackScore(token, String(row.id));
      setMessage("赛道评分已更新");
      await refresh();
      return;
    }
    if (config.entity === "content-samples") {
      await suggestTopics(token, { track_id: row.track_id ? String(row.track_id) : null, limit: 5, persist: true });
      setMessage("已根据爆款内容生成选题");
      return;
    }
    if (config.entity === "comments") {
      await suggestTopics(token, { track_id: row.track_id ? String(row.track_id) : null, limit: 5, persist: true });
      setMessage("已根据评论需求生成选题");
      return;
    }
    setSelected(row);
  }

  return (
    <div className="page-stack">
      <header className="hero-header">
        <div>
          <h1>{config.title}</h1>
          <p>{config.description}</p>
        </div>
        <div className="inline-actions">
          <button className="ghost-button" onClick={() => void downloadExport(token, config.entity, filters, "csv")}>
            <Download size={16} />
            CSV
          </button>
          <button className="ghost-button" onClick={() => void downloadExport(token, config.entity, filters, "xlsx")}>
            <Download size={16} />
            XLSX
          </button>
        </div>
      </header>

      <section className="module-metrics">
        {config.metrics.map((metric) => (
          <MetricCard key={metric.label} label={metric.label} value={metric.get(items)} />
        ))}
        <MetricCard label="待处理动作" value={config.actions.length} />
      </section>

      <section className="workflow-strip">
        {["赛道", "关键词", "信息源", "采集任务", "内容样本", "评论需求", "选题"].map((step, index) => (
          <div key={step} className={step === config.navLabel.replace("管理", "") || config.title.includes(step) ? "current" : ""}>
            <span>{index + 1}</span>
            {step}
          </div>
        ))}
      </section>

      <section className="workspace-grid">
        <FormPanel fields={config.fields} form={form} setForm={setForm} refs={refs} onSubmit={submit} buttonText={config.primaryAction} busy={busy} message={message} />
        <ImportPanel
          value={importText}
          setValue={setImportText}
          onImport={async () => {
            setBusy(true);
            setMessage(null);
            try {
              const result = await importEntity(token, config.entity, importText);
              setMessage(`已导入 ${result.imported} 条`);
              await refresh();
            } catch (caught) {
              setMessage(caughtMessage(caught, "导入失败"));
            } finally {
              setBusy(false);
            }
          }}
        />
      </section>

      <section className="panel">
        <div className="table-toolbar">
          <div className="toolbar-left">
            <input placeholder="搜索名称、标题、评论..." value={filters.keyword} onChange={(event) => setFilters({ ...filters, keyword: event.target.value })} />
            <input placeholder="状态筛选" value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })} />
          </div>
          <button className="ghost-button" onClick={() => void refresh()}>
            <RefreshCw size={16} />
            刷新
          </button>
        </div>
        {error ? <Notice tone="error">{error}</Notice> : null}
        {loading ? (
          <p className="muted">正在加载...</p>
        ) : (
          <DataTable rows={items} columns={config.columns} refs={refs} onSelect={setSelected} onPrimaryAction={runPrimaryAction} primaryAction={config.actions[0] ?? "查看详情"} />
        )}
      </section>

      <DetailDrawer
        row={selected}
        config={config}
        refs={refs}
        onClose={() => setSelected(null)}
        onPrimaryAction={selected ? () => void runPrimaryAction(selected) : undefined}
      />
    </div>
  );
}

function ResearchProjectsPage({ token }: { token: string }) {
  const [projects, setProjects] = useState<ResearchProjectDetail["project"][]>([]);
  const [selected, setSelected] = useState<ResearchProjectDetail | null>(null);
  const [request, setRequest] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [briefForm, setBriefForm] = useState<AnyRecord>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const actionState = selected
    ? getProjectActionState(selected.project.status, selected.brief.open_questions.length)
    : { canConfirm: false, canStart: false };

  const loadProjects = async () => {
    const result = await listResearchProjects(token);
    setProjects(result.items);
    if (!selected && result.items[0]) await selectProject(result.items[0].id);
  };
  const selectProject = async (id: string) => {
    const detail = await getResearchProject(token, id);
    setSelected(detail);
    const brief = detail.brief.brief;
    setBriefForm({
      business_context: brief.business_context ?? "",
      change_event: brief.change_event ?? "",
      target_audience: brief.target_audience ?? "",
      communication_goal: brief.communication_goal ?? "",
      constraints: Array.isArray(brief.constraints) ? brief.constraints.join("\n") : "",
      deliverables: Array.isArray(brief.deliverables) ? brief.deliverables.join("\n") : ""
    });
  };

  useEffect(() => {
    void loadProjects().catch((caught) => setError(caughtMessage(caught, "项目加载失败")));
  }, [token]);

  const run = async (action: () => Promise<ResearchProjectDetail>) => {
    try {
      setBusy(true);
      setError(null);
      const detail = await action();
      setSelected(detail);
      await loadProjects();
      await selectProject(detail.project.id);
    } catch (caught) {
      setError(caughtMessage(caught, "操作失败"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page-stack">
      <header className="hero-header compact-hero">
        <div>
          <p>Research Projects</p>
          <h1>专项调研</h1>
          <span>Project Brief、确认记录与研究启动状态</span>
        </div>
      </header>

      <section className="project-intake panel">
        <div className="section-title">
          <h2><Plus size={18} /> 新建项目</h2>
        </div>
        <textarea value={request} onChange={(event) => setRequest(event.target.value)} placeholder="输入客户背景、业务变化和希望解决的问题" />
        <button
          className="primary-button"
          disabled={busy || request.trim().length < 10}
          onClick={() => void run(async () => {
            const detail = await createResearchProject(token, request);
            setRequest("");
            return detail;
          })}
        >
          <Sparkles size={16} /> 整理为 Project Brief
        </button>
      </section>

      {error ? <Notice tone="error">{error}</Notice> : null}
      <div className="project-workspace">
        <aside className="panel project-list">
          <div className="section-title"><h2>项目列表</h2><span>{projects.length}</span></div>
          {projects.map((project) => (
            <button key={project.id} className={selected?.project.id === project.id ? "project-row active" : "project-row"} onClick={() => void selectProject(project.id)}>
              <strong>{project.name}</strong>
              <span>{statusLabels[project.status] ?? project.status} · v{project.current_brief_version}</span>
            </button>
          ))}
          {!projects.length ? <p className="muted">暂无专项调研项目</p> : null}
        </aside>

        <section className="project-detail">
          {!selected ? <div className="panel"><p className="muted">选择一个项目查看 Brief</p></div> : (
            <>
              <div className="panel project-summary">
                <div className="section-title">
                  <div><h2>{selected.project.name}</h2><span>{selected.project.status}</span></div>
                  <span className="status-pill green">v{selected.brief.version}</span>
                </div>
                <p>{selected.project.raw_request}</p>
              </div>

              {selected.brief.open_questions.length ? (
                <div className="panel question-list">
                  <div className="section-title"><h2>关键缺口</h2><span>{selected.brief.open_questions.length}</span></div>
                  {selected.brief.open_questions.map((question) => (
                    <div className="question-row" key={question.key}>
                      <div><strong>{question.prompt}</strong><span>{question.reason}</span></div>
                      <input value={answers[question.key] ?? ""} onChange={(event) => setAnswers({ ...answers, [question.key]: event.target.value })} />
                      <button className="ghost-button" disabled={busy || !(answers[question.key] ?? "").trim()} onClick={() => void run(() => answerResearchProjectQuestion(token, selected.project.id, question.key, answers[question.key]))}>
                        <CheckCircle2 size={16} /> 提交答案
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}

              <div className="panel brief-editor">
                <div className="section-title"><h2>Project Brief</h2><span>{selected.versions.length} 个版本</span></div>
                {[
                  ["business_context", "业务背景"], ["change_event", "变化事件"],
                  ["target_audience", "目标受众"], ["communication_goal", "传播目标"],
                  ["constraints", "限制条件"], ["deliverables", "交付物"]
                ].map(([key, label]) => (
                  <label key={key}>{label}<textarea value={String(briefForm[key] ?? "")} onChange={(event) => setBriefForm({ ...briefForm, [key]: event.target.value })} /></label>
                ))}
                <div className="form-actions">
                  <button className="ghost-button" disabled={busy} onClick={() => void run(() => reviseResearchProjectBrief(token, selected.project.id, {
                    ...briefForm,
                    constraints: String(briefForm.constraints ?? "").split("\n").filter(Boolean),
                    deliverables: String(briefForm.deliverables ?? "").split("\n").filter(Boolean)
                  }))}><RefreshCw size={16} /> 保存新版本</button>
                  <button className="primary-button" disabled={busy || !actionState.canConfirm} onClick={() => void run(() => confirmResearchProjectBrief(token, selected.project.id))}>
                    <CheckCircle2 size={16} /> 确认 Brief
                  </button>
                  <button className="primary-button" disabled={busy || !actionState.canStart} onClick={async () => {
                    try { setBusy(true); await startResearchProject(token, selected.project.id); await selectProject(selected.project.id); await loadProjects(); }
                    catch (caught) { setError(caughtMessage(caught, "启动失败")); } finally { setBusy(false); }
                  }}><Search size={16} /> 启动研究</button>
                </div>
              </div>

              <ProjectQuickScan
                key={selected.project.id}
                token={token}
                projectId={selected.project.id}
                ready={selected.project.status === "research_ready"}
              />

              <div className="panel project-history">
                <div className="section-title"><h2>版本与确认记录</h2><span>{selected.confirmations.length} 次确认</span></div>
                <div className="history-list">
                  {selected.versions.map((version) => (
                    <div className="history-row" key={String(version.id)}>
                      <strong>Brief v{String(version.version)}</strong>
                      <span>{String(version.change_note ?? "简报更新")}</span>
                      <time>{fmtDate(version.created_at)}</time>
                    </div>
                  ))}
                  {selected.confirmations.map((confirmation) => (
                    <div className="history-row confirmed" key={String(confirmation.id)}>
                      <strong>已确认 v{String(confirmation.brief_version ?? selected.brief.version)}</strong>
                      <span>{String(confirmation.note ?? "确认用于启动专项研究")}</span>
                      <time>{fmtDate(confirmation.confirmed_at)}</time>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function ProjectQuickScan({ token, projectId, ready }: { token: string; projectId: string; ready: boolean }) {
  const [rawUrls, setRawUrls] = useState("");
  const [run, setRun] = useState<ProjectDiscoveryRunDetail>({ run: null, items: [] });
  const [evidence, setEvidence] = useState<ProjectEvidenceItem[]>([]);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<"all" | ProjectEvidenceItem["selection_status"]>("all");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    if (!ready) return;
    const [latest, evidenceResult] = await Promise.all([
      getLatestProjectDiscovery(token, projectId),
      listProjectEvidence(token, projectId)
    ]);
    setRun(latest);
    setEvidence(evidenceResult.items);
    setReasons(Object.fromEntries(evidenceResult.items.map((item) => [item.id, item.decision_reason ?? ""])));
  };

  useEffect(() => {
    void refresh().catch((caught) => setError(caughtMessage(caught, "Quick Scan 加载失败")));
  }, [token, projectId, ready]);

  const act = async (action: () => Promise<unknown>) => {
    try {
      setBusy(true);
      setError(null);
      await action();
      await refresh();
    } catch (caught) {
      setError(caughtMessage(caught, "Quick Scan 操作失败"));
    } finally {
      setBusy(false);
    }
  };

  const urls = rawUrls.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
  const failedItems = run.items.filter((item) => item.status === "failed");
  const visibleEvidence = filter === "all" ? evidence : evidence.filter((item) => item.selection_status === filter);

  return (
    <div className="panel quick-scan-panel">
      <div className="section-title">
        <div><h2><Search size={18} /> Quick Scan</h2><span>粘贴微信公众号公开文章 URL，建立项目证据清单</span></div>
        <div className="form-actions">
          <button className="ghost-button" disabled={busy || !evidence.some((item) => item.selection_status === "included")} onClick={() => void act(() => downloadProjectEvidence(token, projectId, "md"))}>
            <Download size={15} /> Markdown
          </button>
          <button className="ghost-button" disabled={busy || !evidence.some((item) => item.selection_status === "included")} onClick={() => void act(() => downloadProjectEvidence(token, projectId, "csv"))}>
            <Download size={15} /> CSV
          </button>
        </div>
      </div>

      {!ready ? <Notice tone="success">先完成 Project Brief 确认并点击“启动研究”，即可粘贴文章链接。</Notice> : (
        <>
          <div className="quick-scan-input">
            <textarea
              value={rawUrls}
              onChange={(event) => setRawUrls(event.target.value)}
              placeholder={"每行一个微信公众号文章 URL，单次最多 30 条\nhttps://mp.weixin.qq.com/s?..."}
            />
            <button className="primary-button" disabled={busy || urls.length === 0 || urls.length > 30} onClick={() => void act(async () => {
              const result = await runProjectDiscovery(token, projectId, urls);
              setRun(result);
              setRawUrls("");
            })}>
              {busy ? <Loader2 className="spin" size={16} /> : <Search size={16} />} 抓取并加入候选
            </button>
          </div>

          {error ? <Notice tone="error">{error}</Notice> : null}

          {run.run ? (
            <div className="quick-scan-run">
              <div className="quick-scan-stats">
                <MetricCard label="运行状态" value={run.run.status} />
                <MetricCard label="提交" value={run.run.requested_count} />
                <MetricCard label="成功" value={run.run.succeeded_count} />
                <MetricCard label="失败" value={run.run.failed_count} />
              </div>
              {failedItems.length ? (
                <div className="discovery-failures">
                  <div className="section-title">
                    <h3><AlertTriangle size={16} /> 抓取失败</h3>
                    <button className="ghost-button" disabled={busy || !run.run} onClick={() => void act(() => retryProjectDiscovery(token, projectId, run.run!.id))}>
                      <RefreshCw size={15} /> 仅重试失败项
                    </button>
                  </div>
                  {failedItems.map((item) => <p key={item.id}><span>{item.requested_url}</span><strong>{item.error_message ?? "抓取失败"}</strong></p>)}
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="evidence-toolbar">
            <div className="section-title"><h3>项目证据</h3><span>{visibleEvidence.length} 条</span></div>
            <select value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)}>
              <option value="all">全部状态</option>
              <option value="candidate">候选</option>
              <option value="included">已纳入</option>
              <option value="excluded">已排除</option>
            </select>
          </div>

          <div className="evidence-list">
            {visibleEvidence.map((item) => (
              <article className="evidence-card" key={item.id}>
                <div className="evidence-main">
                  <div><span className={`status-pill ${item.selection_status === "included" ? "green" : ""}`}>{item.selection_status}</span><strong>{item.title}</strong></div>
                  <p>{item.source_name ?? item.author ?? "未知来源"} · {fmtDate(item.publish_time)} · 抓取于 {fmtDate(item.captured_at)}</p>
                  <a href={item.canonical_url} target="_blank" rel="noreferrer">查看原文</a>
                </div>
                <div className="evidence-decision">
                  <input value={reasons[item.id] ?? ""} onChange={(event) => setReasons({ ...reasons, [item.id]: event.target.value })} placeholder="选择或排除理由" />
                  <div className="form-actions">
                    <button className="ghost-button" disabled={busy} onClick={() => void act(() => updateProjectEvidence(token, projectId, item.id, "candidate"))}>候选</button>
                    <button className="primary-button" disabled={busy} onClick={() => void act(() => updateProjectEvidence(token, projectId, item.id, "included", reasons[item.id]))}><CheckCircle2 size={15} /> 纳入</button>
                    <button className="ghost-button danger" disabled={busy || !(reasons[item.id] ?? "").trim()} onClick={() => void act(() => updateProjectEvidence(token, projectId, item.id, "excluded", reasons[item.id]))}><X size={15} /> 排除</button>
                  </div>
                </div>
              </article>
            ))}
            {!visibleEvidence.length ? <p className="muted">当前筛选下没有项目证据。</p> : null}
          </div>
        </>
      )}
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: unknown }) {
  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong>{display(value, "0")}</strong>
    </article>
  );
}

function FormPanel({
  fields,
  form,
  setForm,
  refs,
  onSubmit,
  buttonText,
  busy,
  message
}: {
  fields: Field[];
  form: AnyRecord;
  setForm: (value: AnyRecord) => void;
  refs: ReferenceData;
  onSubmit: () => Promise<void>;
  buttonText: string;
  busy?: boolean;
  message?: string | null;
}) {
  return (
    <form
      className="panel form-grid"
      onSubmit={(event) => {
        event.preventDefault();
        void onSubmit();
      }}
    >
      <div className="section-title form-title">
        <h2>
          <PackagePlus size={18} />
          业务信息
        </h2>
      </div>
      {fields.map((field) => (
        <label key={field.key} className={field.wide || field.type === "textarea" ? "wide-field" : undefined}>
          {field.label}
          {renderField(field, form, setForm, refs)}
        </label>
      ))}
      <div className="form-actions">
        <button className="primary-button" disabled={busy}>
          {busy ? "处理中..." : buttonText}
        </button>
        {message ? <span className={message.includes("失败") ? "error-text" : "success-text"}>{message}</span> : null}
      </div>
    </form>
  );
}

function renderField(field: Field, form: AnyRecord, setForm: (value: AnyRecord) => void, refs: ReferenceData) {
  const value = String(form[field.key] ?? "");
  if (field.type === "textarea") {
    return <textarea value={value} placeholder={field.placeholder} onChange={(event) => setForm({ ...form, [field.key]: event.target.value })} />;
  }
  if (field.type === "select") {
    return (
      <select value={value} onChange={(event) => setForm({ ...form, [field.key]: event.target.value })}>
        <option value="">请选择</option>
        {field.options?.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }
  if (field.type === "relation") {
    const options = relationOptions(field.relation, refs);
    return (
      <select value={value} onChange={(event) => setForm({ ...form, [field.key]: event.target.value })}>
        <option value="">请选择</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }
  return (
    <input
      type={field.type ?? "text"}
      value={value}
      placeholder={field.placeholder}
      onChange={(event) => setForm({ ...form, [field.key]: field.type === "number" ? Number(event.target.value) : event.target.value })}
    />
  );
}

function relationOptions(kind: RelationKind | undefined, refs: ReferenceData) {
  if (kind === "platform") return refs.platforms.map((item) => ({ value: String(item.id), label: display(item.name) }));
  if (kind === "track") return refs.tracks.map((item) => ({ value: String(item.id), label: display(item.name) }));
  if (kind === "benchmark") return refs.benchmarks.map((item) => ({ value: String(item.id), label: `${display(item.name)} / ${resolveName(item.platform_id, refs.platforms)}` }));
  if (kind === "content") return refs.content.map((item) => ({ value: String(item.id), label: display(item.title) }));
  if (kind === "ownedAccount") return refs.ownedAccounts.map((item) => ({ value: String(item.id), label: display(item.name) }));
  return platformOptions;
}

function ImportPanel({ value, setValue, onImport }: { value: string; setValue: (value: string) => void; onImport: () => Promise<void> }) {
  return (
    <section className="panel import-panel">
      <div className="section-title">
        <h2>
          <Upload size={18} />
          批量导入模板
        </h2>
        <button className="ghost-button" onClick={() => void onImport()}>
          <Upload size={16} />
          导入
        </button>
      </div>
      <textarea value={value} onChange={(event) => setValue(event.target.value)} />
    </section>
  );
}

function DataTable({
  rows,
  columns,
  refs,
  onSelect,
  onPrimaryAction,
  primaryAction
}: {
  rows: AnyRecord[];
  columns: Array<{ key: string; label: string; tone?: "status" | "number" }>;
  refs: ReferenceData;
  onSelect: (row: AnyRecord) => void;
  onPrimaryAction: (row: AnyRecord) => Promise<void>;
  primaryAction: string;
}) {
  if (!rows.length) return <p className="muted">暂无数据</p>;
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key}>{column.label}</th>
            ))}
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={String(row.id ?? rowIndex)} onClick={() => onSelect(row)}>
              {columns.map((column) => (
                <td key={column.key}>{renderCell(row[column.key], column, refs)}</td>
              ))}
              <td>
                <div className="row-actions">
                  <button
                    className="icon-button quiet"
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelect(row);
                    }}
                    title="查看详情"
                    aria-label="查看详情"
                  >
                    <PanelRightOpen size={16} />
                  </button>
                  <button
                    className="mini-button"
                    onClick={(event) => {
                      event.stopPropagation();
                      void onPrimaryAction(row);
                    }}
                  >
                    {primaryAction}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function renderCell(value: unknown, column: { key: string; tone?: "status" | "number" }, refs: ReferenceData) {
  const resolved = resolveDisplay(column.key, value, refs);
  if (column.key.endsWith("_at") || column.key.endsWith("_time")) return fmtDate(value);
  if (column.tone === "status") return <StatusPill value={resolved} raw={value} />;
  if (column.tone === "number") return <strong className="numeric">{resolved}</strong>;
  return resolved;
}

function resolveDisplay(key: string, value: unknown, refs: ReferenceData) {
  if (key === "platform_id" || key === "primary_platform_id" || key === "source_platform_id") return resolveName(value, refs.platforms);
  if (key === "track_id") return resolveName(value, refs.tracks);
  if (key === "benchmark_account_id" || key === "benchmark_source_id") return resolveName(value, refs.benchmarks);
  if (key === "content_sample_id") return resolveName(value, refs.content, "title");
  if (key === "owned_account_id") return resolveName(value, refs.ownedAccounts);
  return display(statusLabels[String(value)] ?? value);
}

function resolveName(value: unknown, rows: AnyRecord[], field = "name") {
  const raw = String(value ?? "");
  if (!raw) return "-";
  const found = rows.find((row) => String(row.id) === raw || String(row[field]) === raw);
  return found ? display(found[field]) : raw;
}

function StatusPill({ value, raw }: { value: string; raw: unknown }) {
  const rawText = String(raw ?? value).toLowerCase();
  const tone = rawText.includes("fail") || rawText.includes("high") || rawText.includes("失败") ? "red" : rawText.includes("pending") || rawText.includes("waiting") ? "amber" : "green";
  return <span className={`status-pill ${tone}`}>{value}</span>;
}

function DetailDrawer({
  row,
  config,
  refs,
  onClose,
  onPrimaryAction
}: {
  row: AnyRecord | null;
  config: ModuleConfig;
  refs: ReferenceData;
  onClose: () => void;
  onPrimaryAction?: () => void;
}) {
  if (!row) return null;
  return (
    <aside className="detail-drawer">
      <div className="drawer-header">
        <div>
          <p>{config.title}</p>
          <h2>{display(row.name ?? row.title ?? row.keyword ?? row.task_name ?? "详情")}</h2>
        </div>
        <button className="icon-button quiet" onClick={onClose} title="关闭" aria-label="关闭">
          <X size={18} />
        </button>
      </div>
      <div className="drawer-actions">
        <button className="primary-button compact" onClick={onPrimaryAction}>
          <Sparkles size={16} />
          {config.actions[0] ?? "处理"}
        </button>
        <button className="ghost-button compact">
          <Archive size={16} />
          标记已处理
        </button>
      </div>
      <div className="detail-section">
        <h3>关键字段</h3>
        {config.detailFields.map((field) => (
          <div key={field.key} className="detail-row">
            <span>{field.label}</span>
            <strong>{resolveDisplay(field.key, row[field.key], refs)}</strong>
          </div>
        ))}
      </div>
      <div className="detail-section">
        <h3>链路追溯</h3>
        <div className="trace-list">
          <TraceItem icon={Target} label="所属赛道" value={resolveName(row.track_id, refs.tracks)} />
          <TraceItem icon={Globe2} label="平台" value={resolveName(row.platform_id ?? row.primary_platform_id ?? row.source_platform_id, refs.platforms)} />
          <TraceItem icon={BookOpen} label="来源内容" value={resolveName(row.content_sample_id, refs.content, "title")} />
          <TraceItem icon={UsersRound} label="关联账号" value={resolveName(row.benchmark_account_id ?? row.owned_account_id, [...refs.benchmarks, ...refs.ownedAccounts])} />
        </div>
      </div>
    </aside>
  );
}

function TraceItem({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="trace-item">
      <Icon size={16} />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ExportsPage({ token }: { token: string }) {
  const entities = useMemo(() => MODULES.map((config) => config.entity), []);
  const [entity, setEntity] = useState<IncubationEntity>("tracks");
  const [format, setFormat] = useState<"csv" | "xlsx">("xlsx");
  const current = moduleByEntity(entity);

  return (
    <div className="page-stack">
      <header className="hero-header">
        <div>
          <h1>导出中心</h1>
          <p>按业务对象导出 CSV / XLSX，导出记录会写入后端留痕。</p>
        </div>
      </header>
      <section className="panel export-panel">
        <div className="export-form">
          <label>
            导出对象
            <select value={entity} onChange={(event) => setEntity(event.target.value as IncubationEntity)}>
              {entities.map((item) => (
                <option key={item} value={item}>
                  {moduleByEntity(item).title}
                </option>
              ))}
            </select>
          </label>
          <label>
            文件格式
            <select value={format} onChange={(event) => setFormat(event.target.value as "csv" | "xlsx")}>
              <option value="xlsx">XLSX</option>
              <option value="csv">CSV</option>
            </select>
          </label>
          <button className="primary-button" onClick={() => void downloadExport(token, entity, {}, format)}>
            <Download size={16} />
            导出 {format.toUpperCase()}
          </button>
        </div>
        <div className="export-summary">
          <h2>{current.title}</h2>
          <p>{current.description}</p>
          <div className="field-chips">
            {current.columns.map((column) => (
              <span key={column.key}>{column.label}</span>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function SettingsPage() {
  return (
    <div className="page-stack">
      <header className="hero-header">
        <div>
          <h1>系统设置</h1>
          <p>本地 MVP 当前只开放数据导入、导出和任务留痕配置。</p>
        </div>
      </header>
      <section className="settings-grid">
        <InfoBlock icon={Boxes} title="存储路径" value="本地 / 可迁移对象存储" />
        <InfoBlock icon={Bot} title="AI 调用" value="本地规则建议器，无真实 OpenAI 请求" />
        <InfoBlock icon={CheckCircle2} title="合规边界" value="无真实平台爬虫，无自动发布" />
      </section>
    </div>
  );
}

function InfoBlock({ icon: Icon, title, value }: { icon: LucideIcon; title: string; value: string }) {
  return (
    <section className="panel info-block">
      <Icon size={20} />
      <h2>{title}</h2>
      <p>{value}</p>
    </section>
  );
}

function Notice({ tone, children }: { tone: "error" | "success"; children: ReactNode }) {
  return <div className={`notice ${tone}`}>{children}</div>;
}

export default App;
