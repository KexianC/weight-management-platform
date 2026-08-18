import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeftIcon, CheckCircledIcon, ClipboardIcon, ExclamationTriangleIcon, ReloadIcon,
} from '@radix-ui/react-icons';
import { api, ApiError } from './api';
import {
  archiveCompletion, archiveDefaults, archiveSections, isArchiveFieldVisible, isArchiveValueFilled, nextArchiveCheckboxValues,
} from './archive-schema';
import type {
  ArchiveStatus, ClinicalArchiveData, Patient, PatientArchive,
} from './types';

type ArchiveViewProps = {
  patient: Patient;
  onBack: () => void;
  onSaved: (archive: PatientArchive) => void;
  onDirtyChange: (dirty: boolean) => void;
};

function errorText(error: unknown): string {
  if (error instanceof ApiError && error.status === 409) return '档案已被其他医生/营养师更新。请刷新后再继续，避免覆盖对方的内容。';
  return error instanceof Error ? error.message : '档案请求失败，请稍后重试';
}

function compactPhone(phone?: string): string {
  return phone ? phone.replace(/^(\d{3})\d{4}(\d+)/, '$1****$2') : '手机号未填写';
}

function genderLabel(value?: string): string {
  return value === 'MALE' ? '男' : value === 'FEMALE' ? '女' : value === 'OTHER' ? '其他' : '性别未填写';
}

function ageFromBirthDate(value: unknown): number | undefined {
  if (typeof value !== 'string' || !value) return undefined;
  const birth = new Date(value);
  if (Number.isNaN(birth.getTime())) return undefined;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const beforeBirthday = now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate());
  if (beforeBirthday) age -= 1;
  return age >= 0 && age <= 130 ? age : undefined;
}

function calculateBmi(answers: ClinicalArchiveData): number | undefined {
  const height = Number(answers.heightCm);
  const weight = Number(answers.weightKg);
  if (!Number.isFinite(height) || !Number.isFinite(weight) || height <= 0 || weight <= 0) return undefined;
  return Number((weight / ((height / 100) ** 2)).toFixed(1));
}

function valueText(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

function archiveStatusLabel(archive: PatientArchive | null): string {
  if (!archive) return '未建档';
  return archive.status === 'COMPLETED' ? '已完成' : '草稿';
}

export default function ArchiveView({ patient, onBack, onSaved, onDirtyChange }: ArchiveViewProps) {
  const [archive, setArchive] = useState<PatientArchive | null>(null);
  const [answers, setAnswers] = useState<ClinicalArchiveData>({});
  const [baseline, setBaseline] = useState('');
  const [activeSection, setActiveSection] = useState(archiveSections[0].id);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const answersWithDerived = useMemo(() => {
    const bmi = calculateBmi(answers);
    return bmi === undefined ? answers : { ...answers, bmi };
  }, [answers]);
  const serializedAnswers = useMemo(() => JSON.stringify(answersWithDerived), [answersWithDerived]);
  const dirty = Boolean(baseline) && serializedAnswers !== baseline;
  const completion = useMemo(() => archiveCompletion(answersWithDerived), [answersWithDerived]);
  const shownPercent = completion.percentage;

  async function load() {
    setLoading(true); setError(''); setNotice('');
    try {
      const loaded = await api.getPatientArchive(patient.id);
      const merged = { ...archiveDefaults(patient), ...(loaded?.answers ?? {}) };
      const bmi = calculateBmi(merged);
      const nextAnswers = bmi === undefined ? merged : { ...merged, bmi };
      setArchive(loaded);
      setAnswers(nextAnswers);
      setBaseline(JSON.stringify(nextAnswers));
    } catch (requestError) { setError(errorText(requestError)); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, [patient.id]);
  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);
  useEffect(() => {
    function warnBeforeUnload(event: BeforeUnloadEvent) {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = '';
    }
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [dirty]);
  useEffect(() => {
    const elements = archiveSections.map((section) => document.getElementById(`archive-${section.id}`)).filter(Boolean) as HTMLElement[];
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible?.target.id) setActiveSection(visible.target.id.replace('archive-', ''));
    }, { rootMargin: '-120px 0px -65% 0px', threshold: [0, 0.15, 0.4] });
    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [loading]);

  function updateAnswer(key: string, value: unknown) {
    setAnswers((current) => {
      const next = { ...current };
      if (value === '' || value === undefined) delete next[key];
      else next[key] = value;
      return next;
    });
    setNotice('');
  }

  function toggleOption(key: string, optionValue: string, checked: boolean) {
    const current = Array.isArray(answers[key]) ? (answers[key] as unknown[]).filter((item): item is string => typeof item === 'string') : [];
    updateAnswer(key, nextArchiveCheckboxValues(key, current, optionValue, checked));
  }

  function scrollToSection(id: string) {
    setActiveSection(id);
    document.getElementById(`archive-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function save(status: ArchiveStatus) {
    setSaving(true); setError(''); setNotice('');
    try {
      const saved = await api.savePatientArchive(patient.id, {
        status,
        answers: answersWithDerived,
        completionPercent: completion.percentage,
        ...(archive?.updatedAt ? { expectedUpdatedAt: archive.updatedAt } : {}),
      });
      setArchive(saved);
      setAnswers(saved.answers);
      setBaseline(JSON.stringify(saved.answers));
      setNotice(status === 'COMPLETED' ? '档案已标记完成，后续仍可继续编辑。' : '草稿已保存，可稍后继续补录。');
      onSaved(saved);
    } catch (requestError) { setError(errorText(requestError)); }
    finally { setSaving(false); }
  }

  function requestComplete() {
    const remaining = completion.totalFields - completion.filledFields;
    if (remaining > 0 && !window.confirm(`当前已填写 ${completion.filledFields}/${completion.totalFields} 项，仍有 ${remaining} 项未填写。临床可选项允许留空，确认将档案标记为完成吗？`)) return;
    void save('COMPLETED');
  }

  if (loading) return <div className="archive-loading"><ReloadIcon className="spin" /><span>正在加载电子档案…</span></div>;
  if (error && !baseline) return <><button className="back-button" onClick={onBack}><ArrowLeftIcon />返回患者档案</button><div className="error-banner" role="alert"><ExclamationTriangleIcon /><span>{error}</span><button onClick={() => void load()}><ReloadIcon />重试</button></div></>;

  const age = ageFromBirthDate(answers.birthDate) ?? patient.age;
  return <section className="archive-page">
    <div className="archive-topbar panel">
      <button className="back-button" onClick={onBack}><ArrowLeftIcon />返回患者档案</button>
      <div className="archive-person"><span>{patient.displayName.slice(0, 1)}</span><div><h2>{patient.displayName}的体重管理档案</h2><p>{compactPhone(patient.phone)} · {genderLabel(valueText(answers.gender) || patient.gender)} · {age === undefined ? '年龄未填写' : `${age}岁`}</p></div></div>
      <div className="archive-head-meta"><span className={`archive-state archive-state-${archive?.status?.toLowerCase() ?? 'empty'}`}>{archiveStatusLabel(archive)}</span><small>档案编号</small><b>{archive?.archiveNo || '保存后自动生成'}</b></div>
    </div>

    <div className="archive-progress panel">
      <div><span className="archive-progress-ring"><b>{shownPercent}%</b></span><div><h3>建档完成度</h3><p>已填写 {completion.filledFields} 个字段，覆盖 {completion.completedSections}/{completion.totalSections} 个模块</p></div></div>
      <div className="archive-progress-track" aria-label={`建档完成度 ${shownPercent}%`}><span style={{ width: `${shownPercent}%` }} /></div>
      <p>检验结果暂缺可先保存草稿，获取结果后从患者详情继续补录。</p>
    </div>

    {error && <div className="error-banner" role="alert"><ExclamationTriangleIcon /><span>{error}</span>{error.includes('其他医生') && <button onClick={() => void load()}><ReloadIcon />刷新档案</button>}</div>}
    {notice && <div className="archive-notice" role="status"><CheckCircledIcon />{notice}</div>}

    <div className="archive-workspace">
      <aside className="archive-nav panel" aria-label="建档分组导航">
        <div><b>档案目录</b><small>共 {archiveSections.length} 个模块</small></div>
        <nav>{archiveSections.map((section, index) => {
          const visibleFields = section.fields.filter((field) => isArchiveFieldVisible(field, answersWithDerived));
          const filled = visibleFields.filter((field) => isArchiveValueFilled(answersWithDerived[field.key])).length;
          return <button type="button" className={activeSection === section.id ? 'active' : ''} onClick={() => scrollToSection(section.id)} key={section.id}>
            <span>{index + 1}</span><div><b>{section.shortTitle}</b><small>{filled}/{visibleFields.length} 项</small></div>{filled > 0 && <CheckCircledIcon />}
          </button>;
        })}</nav>
      </aside>

      <main className="archive-form" aria-label="中医体重管理电子档案">
        {archiveSections.map((section, sectionIndex) => {
          const visibleFields = section.fields.filter((field) => isArchiveFieldVisible(field, answersWithDerived));
          const filled = visibleFields.filter((field) => isArchiveValueFilled(answersWithDerived[field.key])).length;
          return <article className="archive-section panel" id={`archive-${section.id}`} key={section.id}>
            <header><span>{String(sectionIndex + 1).padStart(2, '0')}</span><div><h3>{section.title}</h3><p>{section.description}</p></div><small>{filled}/{visibleFields.length} 已填</small></header>
            <div className="archive-fields">{visibleFields.map((field) => {
              const rawValue = field.key === 'bmi' ? calculateBmi(answersWithDerived) : answersWithDerived[field.key];
              const selectedValues = Array.isArray(rawValue) ? rawValue.filter((item): item is string => typeof item === 'string') : [];
              const span = field.span ?? 'half';
              return <div className={`archive-field archive-field-${span}`} key={field.key}>
                <label htmlFor={`archive-field-${field.key}`}>{field.label}{field.unit && <small>{field.unit}</small>}</label>
                {field.description && <p>{field.description}</p>}
                {field.type === 'textarea' && <textarea id={`archive-field-${field.key}`} rows={field.rows ?? 3} value={valueText(rawValue)} placeholder={field.placeholder} onChange={(event) => updateAnswer(field.key, event.target.value)} />}
                {field.type === 'select' && <select id={`archive-field-${field.key}`} value={valueText(rawValue)} onChange={(event) => updateAnswer(field.key, event.target.value)}><option value="">请选择</option>{field.options?.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</select>}
                {field.type === 'radio' && <div className="archive-choice-row" id={`archive-field-${field.key}`}>{field.options?.map((item) => <label className={rawValue === item.value ? 'selected' : ''} key={item.value}><input type="radio" name={field.key} value={item.value} checked={rawValue === item.value} onChange={() => updateAnswer(field.key, item.value)} /><span>{item.label}</span></label>)}</div>}
                {field.type === 'checkboxes' && <div className="archive-check-grid" id={`archive-field-${field.key}`}>{field.options?.map((item) => <label className={selectedValues.includes(item.value) ? 'selected' : ''} key={item.value}><input type="checkbox" checked={selectedValues.includes(item.value)} onChange={(event) => toggleOption(field.key, item.value, event.target.checked)} /><span>{item.label}</span></label>)}</div>}
                {['text', 'date', 'time', 'number'].includes(field.type) && <div className="archive-input-wrap"><input id={`archive-field-${field.key}`} type={field.type} value={valueText(rawValue)} placeholder={field.placeholder} min={field.min} max={field.max} step={field.step} readOnly={field.key === 'bmi'} onChange={(event) => updateAnswer(field.key, field.type === 'number' ? (event.target.value === '' ? undefined : Number(event.target.value)) : event.target.value)} />{field.unit && <span>{field.unit}</span>}</div>}
              </div>;
            })}</div>
          </article>;
        })}
      </main>
    </div>

    <footer className="archive-actions panel">
      <div><ClipboardIcon /><span><b>{dirty ? '有未保存修改' : archive ? '所有修改已保存' : '尚未创建档案'}</b><small>{archive?.updatedAt ? `最近保存：${new Date(archive.updatedAt).toLocaleString('zh-CN')}` : '可先保存草稿，稍后补录'}</small></span></div>
      <div><button type="button" onClick={onBack}>返回</button><button type="button" disabled={saving} onClick={() => void save(archive?.status === 'COMPLETED' ? 'COMPLETED' : 'DRAFT')}>{saving ? '保存中…' : archive?.status === 'COMPLETED' ? '保存修改' : '保存草稿'}</button>{archive?.status !== 'COMPLETED' && <button type="button" className="primary" disabled={saving} onClick={requestComplete}><CheckCircledIcon />标记完成</button>}</div>
    </footer>
  </section>;
}
