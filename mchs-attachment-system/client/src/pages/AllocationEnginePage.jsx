import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Modal, Spinner, RotationBadge } from '../components/ui';
import { YEARS } from '../lib/constants';

const STEPS = ['Students', 'Period', 'Districts', 'Rules', 'Run', 'Review'];

const PROCESSING_MESSAGES = [
  'Analyzing eligible students…',
  'Checking previous allocation history…',
  'Balancing district capacity…',
  'Optimizing rotation…',
];

export default function AllocationEnginePage() {
  const [step, setStep] = useState(0);

  // Step data
  const [cohorts, setCohorts] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [periods, setPeriods] = useState([]);

  const [selection, setSelection] = useState({
    allEligible: false,
    yearOfStudy: '',
    cohortIds: [],
  });
  const [periodId, setPeriodId] = useState('');
  const [selectedDistrictIds, setSelectedDistrictIds] = useState([]);
  const [rules, setRules] = useState({ avoidRepetition: true, balanceGender: true });

  const [processing, setProcessing] = useState(false);
  const [processingMsgIndex, setProcessingMsgIndex] = useState(0);
  const [runResult, setRunResult] = useState(null);
  const [runError, setRunError] = useState('');
  const [committing, setCommitting] = useState(false);
  const [committed, setCommitted] = useState(false);

  useEffect(() => {
    api.get('/api/cohorts').then(setCohorts).catch(() => {});
    api.get('/api/districts').then((d) => setDistricts(d.filter((x) => x.is_active))).catch(() => {});
    api.get('/api/periods').then((p) => setPeriods(p.filter((x) => !x.is_locked))).catch(() => {});
  }, []);

  const toggleCohort = (id) => {
    setSelection((s) => ({
      ...s,
      cohortIds: s.cohortIds.includes(id) ? s.cohortIds.filter((c) => c !== id) : [...s.cohortIds, id],
    }));
  };

  const toggleDistrict = (id) => {
    setSelectedDistrictIds((ids) => (ids.includes(id) ? ids.filter((d) => d !== id) : [...ids, id]));
  };

  const canProceed = [
    selection.allEligible || selection.yearOfStudy || selection.cohortIds.length > 0,
    !!periodId,
    selectedDistrictIds.length > 0,
    true,
    true,
    true,
  ];

  const runAllocation = async () => {
    setStep(4);
    setProcessing(true);
    setRunError('');
    setRunResult(null);
    setCommitted(false);

    let msgIdx = 0;
    const msgTimer = setInterval(() => {
      msgIdx = Math.min(msgIdx + 1, PROCESSING_MESSAGES.length - 1);
      setProcessingMsgIndex(msgIdx);
    }, 700);

    try {
      const res = await api.post('/api/allocations/run', {
        yearOfStudy: selection.allEligible ? undefined : selection.yearOfStudy || undefined,
        cohortIds: selection.allEligible ? undefined : selection.cohortIds,
        allEligible: selection.allEligible,
        attachmentPeriodId: periodId,
        districtIds: selectedDistrictIds,
        rules,
      });
      // small artificial delay so the processing animation reads as genuine work
      await new Promise((r) => setTimeout(r, 1400));
      setRunResult(res);
      setStep(5);
    } catch (err) {
      setRunError(err.message);
    } finally {
      clearInterval(msgTimer);
      setProcessing(false);
    }
  };

  const commitAllocation = async () => {
    if (!runResult) return;
    setCommitting(true);
    try {
      await api.post('/api/allocations/commit', {
        attachmentPeriodId: runResult.attachmentPeriodId,
        results: runResult.results,
      });
      setCommitted(true);
    } catch (err) {
      setRunError(err.message);
    } finally {
      setCommitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy-900">Intelligent Allocation Engine</h1>
        <p className="text-navy-400 mt-1">Generate a fair, history-aware clinical attachment allocation.</p>
      </div>

      <Stepper steps={STEPS} current={step} />

      <div className="card p-6">
        {step === 0 && (
          <StepStudents selection={selection} setSelection={setSelection} cohorts={cohorts} toggleCohort={toggleCohort} />
        )}
        {step === 1 && <StepPeriod periods={periods} periodId={periodId} setPeriodId={setPeriodId} />}
        {step === 2 && (
          <StepDistricts districts={districts} selectedDistrictIds={selectedDistrictIds} toggleDistrict={toggleDistrict} />
        )}
        {step === 3 && <StepRules rules={rules} setRules={setRules} />}
        {step === 4 && (
          <StepRun
            processing={processing}
            message={PROCESSING_MESSAGES[processingMsgIndex]}
            error={runError}
            onRetry={runAllocation}
          />
        )}
        {step === 5 && runResult && (
          <StepReview
            runResult={runResult}
            districts={districts}
            onCommit={commitAllocation}
            committing={committing}
            committed={committed}
            error={runError}
          />
        )}

        {step < 4 && (
          <div className="flex justify-between mt-8 pt-6 border-t border-surface-border">
            <button className="btn-secondary" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
              Back
            </button>
            {step === 3 ? (
              <button className="btn-gold font-bold" onClick={runAllocation} disabled={!canProceed[step]}>
                ⚙ Generate Smart Allocation
              </button>
            ) : (
              <button className="btn-primary" disabled={!canProceed[step]} onClick={() => setStep((s) => s + 1)}>
                Continue
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Stepper({ steps, current }) {
  return (
    <div className="flex items-center overflow-x-auto pb-2">
      {steps.map((label, i) => (
        <div key={label} className="flex items-center shrink-0">
          <div className="flex flex-col items-center">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                i < current
                  ? 'bg-teal-500 text-white'
                  : i === current
                  ? 'bg-navy-800 text-white'
                  : 'bg-surface-muted text-navy-400'
              }`}
            >
              {i < current ? '✓' : i + 1}
            </div>
            <p className={`text-xs mt-1 font-medium ${i === current ? 'text-navy-800' : 'text-navy-400'}`}>{label}</p>
          </div>
          {i < steps.length - 1 && <div className={`h-0.5 w-8 sm:w-14 mx-1 ${i < current ? 'bg-teal-400' : 'bg-surface-border'}`} />}
        </div>
      ))}
    </div>
  );
}

function StepStudents({ selection, setSelection, cohorts, toggleCohort }) {
  return (
    <div>
      <h3 className="font-bold text-navy-900 mb-1">Step 1 — Select Students</h3>
      <p className="text-navy-400 text-sm mb-5">Choose which students are eligible for this allocation run.</p>

      <label className="flex items-center gap-3 p-3 rounded-lg border border-surface-border mb-4 cursor-pointer">
        <input
          type="checkbox"
          checked={selection.allEligible}
          onChange={(e) => setSelection((s) => ({ ...s, allEligible: e.target.checked }))}
        />
        <span className="font-medium text-navy-800">All Eligible Students</span>
      </label>

      {!selection.allEligible && (
        <>
          <div className="mb-4">
            <label className="label">Filter by Year</label>
            <div className="flex gap-2 flex-wrap">
              {YEARS.map((y) => (
                <button
                  key={y}
                  type="button"
                  onClick={() => setSelection((s) => ({ ...s, yearOfStudy: s.yearOfStudy === y ? '' : y }))}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold border ${
                    selection.yearOfStudy === y
                      ? 'bg-navy-800 text-white border-navy-800'
                      : 'bg-white text-navy-600 border-surface-border'
                  }`}
                >
                  {y}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="label">Cohorts (select one or more)</label>
            <div className="grid sm:grid-cols-2 gap-2">
              {cohorts.map((c) => (
                <label key={c.id} className="flex items-center gap-2 p-2.5 rounded-lg border border-surface-border text-sm cursor-pointer">
                  <input type="checkbox" checked={selection.cohortIds.includes(c.id)} onChange={() => toggleCohort(c.id)} />
                  {c.name} <span className="text-navy-400">({c.studentCount})</span>
                </label>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function StepPeriod({ periods, periodId, setPeriodId }) {
  return (
    <div>
      <h3 className="font-bold text-navy-900 mb-1">Step 2 — Select Attachment Period</h3>
      <p className="text-navy-400 text-sm mb-5">Choose the period this allocation applies to. Locked periods aren't shown.</p>
      <div className="grid sm:grid-cols-2 gap-3">
        {periods.map((p) => (
          <label
            key={p.id}
            className={`p-4 rounded-lg border cursor-pointer ${
              periodId === p.id ? 'border-medblue-400 bg-medblue-50' : 'border-surface-border'
            }`}
          >
            <input type="radio" name="period" className="hidden" checked={periodId === p.id} onChange={() => setPeriodId(p.id)} />
            <p className="font-semibold text-navy-800">{p.name}</p>
            <p className="text-xs text-navy-400">{p.status}</p>
          </label>
        ))}
        {periods.length === 0 && <p className="text-navy-400 text-sm">No open attachment periods available.</p>}
      </div>
    </div>
  );
}

function StepDistricts({ districts, selectedDistrictIds, toggleDistrict }) {
  return (
    <div>
      <h3 className="font-bold text-navy-900 mb-1">Step 3 — Select Districts</h3>
      <p className="text-navy-400 text-sm mb-5">Choose which districts are available for this allocation run.</p>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {districts.map((d) => (
          <label
            key={d.id}
            className={`p-4 rounded-lg border cursor-pointer ${
              selectedDistrictIds.includes(d.id) ? 'border-teal-400 bg-teal-50' : 'border-surface-border'
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <input type="checkbox" checked={selectedDistrictIds.includes(d.id)} onChange={() => toggleDistrict(d.id)} />
              <span className="font-semibold text-navy-800">{d.name}</span>
            </div>
            <p className="text-xs text-navy-400">Capacity: {d.capacity} · Available: {d.availableSpaces}</p>
          </label>
        ))}
      </div>
    </div>
  );
}

function StepRules({ rules, setRules }) {
  const RULE_INFO = [
    {
      key: 'avoidRepetition',
      title: 'Avoid District Repetition',
      desc: 'Prioritize districts a student has not previously visited.',
    },
    {
      key: 'balanceGender',
      title: 'Balance Gender',
      desc: 'Distribute male and female students fairly across districts where possible.',
    },
  ];
  const FIXED_RULES = [
    { title: 'Balance District Capacity', desc: 'Never exceeds the maximum capacity of any district.' },
    { title: 'Prevent Duplicate Allocation', desc: 'A student cannot be assigned to two districts in the same period.' },
    { title: 'Cohort Rotation', desc: 'Students rotate through different districts over multiple periods.' },
    { title: 'Multiple Cohorts', desc: 'Multiple cohorts can be processed in the same run.' },
  ];

  return (
    <div>
      <h3 className="font-bold text-navy-900 mb-1">Step 4 — Allocation Rules</h3>
      <p className="text-navy-400 text-sm mb-5">Configure how the engine should allocate students.</p>

      <div className="space-y-3 mb-6">
        {RULE_INFO.map((r) => (
          <label key={r.key} className="flex items-start gap-3 p-4 rounded-lg border border-surface-border cursor-pointer">
            <input
              type="checkbox"
              className="mt-1"
              checked={rules[r.key]}
              onChange={(e) => setRules((prev) => ({ ...prev, [r.key]: e.target.checked }))}
            />
            <div>
              <p className="font-semibold text-navy-800">{r.title}</p>
              <p className="text-sm text-navy-400">{r.desc}</p>
            </div>
          </label>
        ))}
      </div>

      <p className="label mb-2">Always Enforced</p>
      <div className="space-y-2">
        {FIXED_RULES.map((r) => (
          <div key={r.title} className="flex items-start gap-3 p-3 rounded-lg bg-surface-muted">
            <span className="text-teal-600 mt-0.5">✓</span>
            <div>
              <p className="font-medium text-navy-700 text-sm">{r.title}</p>
              <p className="text-xs text-navy-400">{r.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StepRun({ processing, message, error, onRetry }) {
  return (
    <div className="text-center py-12">
      {processing ? (
        <>
          <Spinner size={40} />
          <p className="text-navy-700 font-semibold mt-4">{message}</p>
        </>
      ) : error ? (
        <>
          <p className="text-rose-600 font-semibold">{error}</p>
          <button className="btn-primary mt-4" onClick={onRetry}>Retry</button>
        </>
      ) : null}
    </div>
  );
}

function StepReview({ runResult, districts, onCommit, committing, committed, error }) {
  const { summary, results } = runResult;
  const [adjusting, setAdjusting] = useState(null);

  return (
    <div>
      <div className="flex items-center gap-3 mb-1">
        <span className="text-2xl">✅</span>
        <h3 className="font-bold text-navy-900 text-lg">Allocation Successfully Generated</h3>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 my-5">
        <ResultStat label="Students Processed" value={summary.totalProcessed} />
        <ResultStat label="Students Allocated" value={summary.totalAllocated} accent="teal" />
        <ResultStat label="Duplicate Allocations" value={summary.duplicateAllocations} accent="teal" />
        <ResultStat label="Without Placement" value={summary.totalUnallocated} accent={summary.totalUnallocated > 0 ? 'gold' : 'teal'} />
      </div>

      {summary.capacityWarnings?.length > 0 && (
        <div className="bg-rose-50 border border-rose-100 rounded-lg p-3 mb-4 text-sm text-rose-600">
          Capacity warning: {summary.capacityWarnings.map((w) => `${w.districtName} over by ${w.overBy}`).join(', ')}
        </div>
      )}
      {summary.totalUnallocated > 0 && (
        <div className="bg-gold-50 border border-gold-100 rounded-lg p-3 mb-4 text-sm text-gold-700">
          {summary.totalUnallocated} student(s) could not be placed — all selected districts reached capacity.
        </div>
      )}

      <div className="overflow-x-auto border border-surface-border rounded-lg mb-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-navy-400 bg-surface-muted">
              <th className="px-3 py-2.5">Student ID</th>
              <th className="px-3 py-2.5">Name</th>
              <th className="px-3 py-2.5">Gender</th>
              <th className="px-3 py-2.5">Year</th>
              <th className="px-3 py-2.5">Previous District</th>
              <th className="px-3 py-2.5">New District</th>
              <th className="px-3 py-2.5">Rotation</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r) => (
              <tr key={r.studentId} className="border-t border-surface-border">
                <td className="px-3 py-2 font-mono text-xs text-navy-500">{r.studentNumber}</td>
                <td className="px-3 py-2 text-navy-700 font-medium">{r.studentName}</td>
                <td className="px-3 py-2 text-navy-500">{r.gender}</td>
                <td className="px-3 py-2 text-navy-500">{r.yearOfStudy}</td>
                <td className="px-3 py-2 text-navy-500">{r.previousDistrict || '—'}</td>
                <td className="px-3 py-2 font-semibold text-navy-800">{r.newDistrict || 'Unallocated'}</td>
                <td className="px-3 py-2"><RotationBadge status={r.rotationStatus} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {error && <p className="text-sm text-rose-600 mb-3">{error}</p>}

      {committed ? (
        <div className="bg-teal-50 border border-teal-100 rounded-lg p-4 text-teal-700 font-semibold text-center">
          Allocation saved. Review the Attachment Periods page to finalize when ready.
        </div>
      ) : (
        <div className="flex justify-end gap-3">
          <button className="btn-primary" disabled={committing} onClick={onCommit}>
            {committing ? 'Saving…' : 'Save Allocation'}
          </button>
        </div>
      )}
    </div>
  );
}

function ResultStat({ label, value, accent = 'navy' }) {
  const map = { navy: 'text-navy-800', teal: 'text-teal-600', gold: 'text-gold-600' };
  return (
    <div className="bg-surface-muted rounded-lg p-3 text-center">
      <p className={`text-2xl font-bold ${map[accent]}`}>{value}</p>
      <p className="text-xs text-navy-400 mt-0.5">{label}</p>
    </div>
  );
}
