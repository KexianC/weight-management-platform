import { useMemo, useState } from "react";
import {
  BackpackIcon,
  BarChartIcon,
  BlendingModeIcon,
  CalendarIcon,
  CheckCircledIcon,
  ChevronRightIcon,
  ClipboardIcon,
  HeartIcon,
  LockClosedIcon,
  PersonIcon,
  QuestionMarkCircledIcon,
  SunIcon,
} from "@radix-ui/react-icons";
import {
  CartesianGrid,
  LabelList,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BottomSheet, KeyboardInput, MobileScroll, useKeyboard } from "./mobile";
import { createWeightRecord } from "./api";

const initialTrend = [
  { date: "8/10", weight: 69.1 },
  { date: "8/11", weight: 68.7 },
  { date: "8/12", weight: 68.6 },
  { date: "8/13", weight: 68.4 },
  { date: "8/14", weight: 68.5 },
  { date: "8/15", weight: 68.2 },
  { date: "8/16", weight: 68.2 },
];

export default function Prototype() {
  const keyboard = useKeyboard();
  const [weight, setWeight] = useState(68.2);
  const [draftWeight, setDraftWeight] = useState("68.2");
  const [recordOpen, setRecordOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [taskDone, setTaskDone] = useState(false);
  const [water, setWater] = useState(600);
  const [saved, setSaved] = useState(false);

  const trend = useMemo(
    () => initialTrend.map((item, index) => (index === initialTrend.length - 1 ? { ...item, weight } : item)),
    [weight],
  );

  const saveWeight = async () => {
    const nextWeight = Number.parseFloat(draftWeight);
    if (!Number.isFinite(nextWeight) || nextWeight < 30 || nextWeight > 300) return;
    keyboard.hide();
    setWeight(Number(nextWeight.toFixed(1)));
    const token = window.localStorage.getItem("weightcare_access_token");
    if (token) await createWeightRecord(token, Number(nextWeight.toFixed(1))).catch(() => undefined);
    setSaved(true);
    window.setTimeout(() => setRecordOpen(false), 320);
  };

  return (
    <>
      <MobileScroll className="app-screen">
        <main className="patient-home" aria-label="体重管理患者首页">
          <header className="home-header">
            <img className="brand-lockup" src="/assets/brand-lockup.png" alt="轻盈伴行" draggable={false} />
            <button className="profile-button" type="button" onClick={() => setProfileOpen(true)}>
              <PersonIcon aria-hidden="true" />
              我的
            </button>
          </header>

          <section className="greeting" aria-labelledby="greeting-title">
            <SunIcon className="greeting-icon" aria-hidden="true" />
            <div>
              <h1 id="greeting-title">早上好，今天也要好好照顾自己</h1>
              <p>2026年8月16日 · 星期日</p>
            </div>
          </section>

          <section className="weight-card" aria-labelledby="current-weight-title">
            <div className="weight-card-head">
              <span id="current-weight-title">当前体重 <QuestionMarkCircledIcon aria-hidden="true" /></span>
              <span>近7天趋势</span>
            </div>
            <div className="weight-summary">
              <div>
                <strong>{weight.toFixed(1)}</strong>
                <span className="weight-unit">kg</span>
                <p>较昨日 <b>−0.3 kg</b></p>
              </div>
              <div className="mini-chart" aria-label="近七天体重微趋势">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trend} margin={{ top: 6, right: 2, bottom: 2, left: 2 }}>
                    <Line isAnimationActive={false} type="monotone" dataKey="weight" stroke="#168db8" strokeWidth={2.5} dot={{ r: 3, fill: "#168db8" }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
            <button className="primary-button" type="button" onClick={() => { setSaved(false); setRecordOpen(true); }}>
              <ClipboardIcon aria-hidden="true" />
              记录今日体重
            </button>
            <p className="card-helper">每日记录，变化看得见</p>
          </section>

          <section className="today-section" aria-labelledby="today-title">
            <div className="section-heading">
              <h2 id="today-title"><BackpackIcon aria-hidden="true" /> 今日任务 <span>· 医生/营养师为你定制</span></h2>
              <button type="button">查看全部 <ChevronRightIcon aria-hidden="true" /></button>
            </div>
            <div className="task-panel">
              <div className="task-row">
                <div className="task-icon"><CalendarIcon aria-hidden="true" /></div>
                <div className="task-copy">
                  <div>
                    <strong>记录三餐饮食</strong>
                    <span className={taskDone ? "status-complete" : "status-due"}>{taskDone ? "已完成" : "今日需完成"}</span>
                  </div>
                  <p>拍照或记录所吃食物，帮助评估饮食结构</p>
                </div>
                <button className="outline-button" type="button" onClick={() => setTaskDone((value) => !value)}>
                  {taskDone ? "已完成" : "去完成"}
                </button>
              </div>
              <button className="dietitian-note" type="button" onClick={() => setProfileOpen(true)}>
                <img src="/assets/clinician-avatar.png" alt="营养师头像" draggable={false} />
                <span><strong>营养师提醒</strong><small>规律记录饮食，有助于更精准地调整方案</small></span>
                <ChevronRightIcon aria-hidden="true" />
              </button>
            </div>
          </section>

          <section className="trend-card" aria-labelledby="trend-title">
            <div className="section-heading compact">
              <h2 id="trend-title"><BarChartIcon aria-hidden="true" /> 体重趋势（近7天）</h2>
              <span>单位：kg</span>
            </div>
            <div className="full-chart" aria-label="近七天体重折线图">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend} margin={{ top: 8, right: 8, bottom: 4, left: -22 }}>
                  <CartesianGrid stroke="#e9f0f3" vertical={false} />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: "#7a8794", fontSize: 10 }} />
                  <YAxis domain={[64, 70]} axisLine={false} tickLine={false} tick={{ fill: "#7a8794", fontSize: 10 }} />
                  <Tooltip formatter={(value) => [`${value} kg`, "体重"]} labelStyle={{ color: "#1d3448" }} />
                  <Line isAnimationActive={false} type="monotone" dataKey="weight" stroke="#168db8" strokeWidth={2.6} dot={{ r: 3.5, fill: "#ffffff", stroke: "#168db8", strokeWidth: 2 }} activeDot={{ r: 5 }}>
                    <LabelList dataKey="weight" position="top" fill="#334b59" fontSize={9} formatter={(value: unknown) => Number(value).toFixed(1)} />
                  </Line>
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="safety-note">
            <div className="safety-icon"><HeartIcon aria-hidden="true" /></div>
            <div><strong>你的健康，我们一起守护</strong><p>所有数据仅用于健康管理，不属于诊断。如有不适，请及时就医。</p></div>
          </section>

          <button className="water-row" type="button" onClick={() => setWater((value) => Math.min(1700, value + 200))}>
            <span className="water-icon" aria-hidden="true"><BlendingModeIcon /></span>
            <span><strong>喝水小贴士</strong><small>建议每日饮水 1500–1700 ml</small></span>
            <span className="water-value">今日已喝 <b>{water} ml</b><ChevronRightIcon aria-hidden="true" /></span>
          </button>
        </main>
      </MobileScroll>

      <BottomSheet open={recordOpen} onOpenChange={setRecordOpen} title="记录今日体重" description="记录会同步给与你建立服务关系的医生或营养师。" snap={0.5}>
        <div className="record-form">
          <label htmlFor="weight-input">体重（kg）</label>
          <div className="weight-input-wrap">
            <KeyboardInput
              id="weight-input"
              value={draftWeight}
              onChange={(event) => { setDraftWeight(event.target.value); setSaved(false); }}
              inputMode="decimal"
              aria-label="今日体重"
            />
            <span>kg</span>
          </div>
          <p className="form-note"><LockClosedIcon aria-hidden="true" /> 仅授权的照护团队可以查看</p>
          <button className="sheet-save" type="button" onClick={() => void saveWeight()}>
            {saved ? <><CheckCircledIcon aria-hidden="true" /> 已保存</> : "保存记录"}
          </button>
        </div>
      </BottomSheet>

      <BottomSheet open={profileOpen} onOpenChange={setProfileOpen} title="我的照护团队" description="你的数据仅对已授权的专业人员可见。" snap={0.44}>
        <div className="team-sheet">
          <img src="/assets/clinician-avatar.png" alt="陈营养师头像" draggable={false} />
          <div><strong>陈营养师</strong><span>注册营养师 · 体重管理</span><p>建议保持规律记录，系统会在异常变化时提示你联系专业人员。</p></div>
        </div>
      </BottomSheet>
    </>
  );
}
