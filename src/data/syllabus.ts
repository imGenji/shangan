import { PLANNED_ARTICLES } from "./plan";

/** 客观题满分 */
export const OBJECTIVE_TOTAL = 300;

export type SyllabusTopic = {
  label: string;
  slug: string;
};

export type SyllabusSubject = {
  name: string;
  objective: number;
  subjective: number | null;
  articles: number;
  hue: number;
  topics: SyllabusTopic[];
  note?: string;
};

/** 八科分值 + 篇数 + 考点（slug 供筛选链接） */
export const SYLLABUS_SUBJECTS: SyllabusSubject[] = [
  {
    name: "商经知",
    objective: 60,
    subjective: 30,
    articles: 29,
    hue: 28,
    topics: [
      { label: "公司法", slug: "gongsi-fa" },
      { label: "破产与证券", slug: "pochan-zhengquan" },
      { label: "知识产权", slug: "zhishi-chquan" },
      { label: "经济法", slug: "jingji-fa" },
      { label: "劳动与社会保障", slug: "laodong-shebao" },
      { label: "环境资源", slug: "huanjing-ziyuan" },
    ],
    note: "客观第一大科，五法拼盘",
  },
  {
    name: "理论法",
    objective: 50,
    subjective: 25,
    articles: 23,
    hue: 200,
    topics: [
      { label: "习近平法治思想", slug: "xjp-fazhi" },
      { label: "法理学", slug: "falixue" },
      { label: "宪法", slug: "xianfa" },
      { label: "中国法律史", slug: "fazhi-shi" },
      { label: "司法制度与职业道德", slug: "sifa-zhiye" },
    ],
    note: "宜分散背诵，不宜集中攻坚",
  },
  {
    name: "民法",
    objective: 45,
    subjective: 55,
    articles: 37,
    hue: 210,
    topics: [
      { label: "总则与基本原则", slug: "minfa-yuanze" },
      { label: "民事主体", slug: "minshi-zhuti" },
      { label: "法律行为与代理", slug: "falv-xingwei" },
      { label: "物权", slug: "wuquan" },
      { label: "合同", slug: "hetong" },
      { label: "人格权", slug: "renge-quan" },
      { label: "婚姻继承", slug: "hunyin-jicheng" },
      { label: "侵权责任", slug: "qinquan-zeren" },
      { label: "担保", slug: "danbao" },
    ],
    note: "主客观合计 100 分，唯一双线科目",
  },
  {
    name: "刑法",
    objective: 38,
    subjective: 40,
    articles: 30,
    hue: 350,
    topics: [
      { label: "犯罪论", slug: "fanzui-lun" },
      { label: "刑罚体系", slug: "xingfa-tixi" },
      { label: "人身财产犯罪", slug: "ren-shen-caichan" },
      { label: "贪污贿赂", slug: "tanwu-huilu" },
      { label: "危害公共安全", slug: "gonggong-anquan" },
      { label: "其他常考罪名", slug: "qita-zuiming" },
    ],
    note: "体系建成后期提分快",
  },
  {
    name: "刑诉法",
    objective: 32,
    subjective: 30,
    articles: 25,
    hue: 260,
    topics: [
      { label: "管辖与回避", slug: "guanxia-huibi" },
      { label: "辩护与证据", slug: "bianhu-zhengju" },
      { label: "强制措施", slug: "qiangzhi-cuoshi" },
      { label: "侦查与起诉", slug: "zhencha-qisu" },
      { label: "审判程序", slug: "shenpan-chengxu" },
      { label: "执行", slug: "xingsu-zhixing" },
    ],
  },
  {
    name: "民诉法",
    objective: 30,
    subjective: 30,
    articles: 23,
    hue: 190,
    topics: [
      { label: "管辖与当事人", slug: "minsu-guanxia" },
      { label: "证据与保全", slug: "zhengju-baoquan" },
      { label: "一审二审", slug: "yishen-ershen" },
      { label: "再审与执行", slug: "zaishen-zhixing" },
      { label: "仲裁", slug: "zhongcai" },
      { label: "特别与督促程序", slug: "tebie-cudu" },
    ],
  },
  {
    name: "行政法",
    objective: 25,
    subjective: 22,
    articles: 22,
    hue: 45,
    topics: [
      { label: "行政主体与行为", slug: "xingzheng-zhuti" },
      { label: "行政许可与处罚", slug: "xuke-chufa" },
      { label: "行政复议", slug: "xingzheng-fuyi" },
      { label: "行政诉讼", slug: "xingzheng-susong" },
      { label: "国家赔偿", slug: "guojia-peichang" },
    ],
  },
  {
    name: "三国法",
    objective: 18,
    subjective: null,
    articles: 11,
    hue: 160,
    topics: [
      { label: "国际公法", slug: "guoji-gongfa" },
      { label: "国际私法", slug: "guoji-sifa" },
      { label: "国际经济法", slug: "guoji-jingji" },
    ],
    note: "主观题不考，考前突击性价比高",
  },
];

const _articlesSum = SYLLABUS_SUBJECTS.reduce((n, s) => n + s.articles, 0);
if (_articlesSum !== PLANNED_ARTICLES) {
  throw new Error(`syllabus articles sum ${_articlesSum} ≠ PLANNED_ARTICLES ${PLANNED_ARTICLES}`);
}

/** slug → 标签信息 */
export const TAG_BY_SLUG = Object.fromEntries(
  SYLLABUS_SUBJECTS.flatMap((s) =>
    s.topics.map((t) => [t.slug, { ...t, subject: s.name }] as const),
  ),
) as Record<string, { label: string; slug: string; subject: string }>;

export const SYLLABUS_TAG_SLUGS = Object.keys(TAG_BY_SLUG) as [string, ...string[]];

export type SyllabusPhase = {
  name: string;
  articles: number;
  period: string;
  goal: string;
};

export const SYLLABUS_PHASES: SyllabusPhase[] = [
  { name: "基础精讲", articles: 98, period: "2026-09 → 2027-03", goal: "八科各过一遍，建立体系" },
  { name: "真题强化", articles: 57, period: "2027-03 → 2027-06", goal: "分科精刷，错题二刷" },
  { name: "主观专攻", articles: 30, period: "2027-06 → 2027-08", goal: "案例写作与法条检索" },
  { name: "冲刺模考", articles: 15, period: "2027-08 → 考前", goal: "全真机考，节奏与取舍" },
];

export function tagLabel(slug: string): string {
  return TAG_BY_SLUG[slug]?.label ?? slug;
}

export function subjectForTag(slug: string): string | undefined {
  return TAG_BY_SLUG[slug]?.subject;
}
