import { useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '@/lib/hooks/useAuth';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

interface CountEntry {
  count: number;
  timestamp: string;
  confidence?: string;
}

interface CameraStatus {
  cameraId: string;
  cameraName: string;
  current: CountEntry | null;
  history: CountEntry[];
  lastError?: string;
  lastAnalyzedAt?: string;
}

interface StatusResponse {
  timestamp: string;
  totalCount: number;
  cameras: CameraStatus[];
}

interface AnalyzeResult {
  timestamp: string;
  provider: string;
  totalCount: number;
  cameras: {
    cameraId: string;
    cameraName: string;
    count?: number;
    confidence?: string;
    details?: string;
    error?: string;
  }[];
}

function getCountColor(count: number): string {
  if (count === 0) return 'text-gray-400';
  if (count <= 5) return 'text-green-600';
  if (count <= 10) return 'text-orange-500';
  return 'text-red-600';
}

function getCountBg(count: number): string {
  if (count === 0) return 'bg-gray-50 border-gray-200';
  if (count <= 5) return 'bg-green-50 border-green-200';
  if (count <= 10) return 'bg-orange-50 border-orange-200';
  return 'bg-red-50 border-red-200';
}

function formatTime(isoString: string): string {
  return new Date(isoString).toLocaleTimeString('nl-BE', {
    timeZone: 'Europe/Brussels',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function CameraCard({
  camera,
  onAnalyze,
  analyzing,
}: {
  camera: CameraStatus;
  onAnalyze: (id: string) => void;
  analyzing: boolean;
}) {
  const [showSnapshot, setShowSnapshot] = useState(false);
  const [snapshotKey, setSnapshotKey] = useState(0);
  const count = camera.current?.count ?? 0;

  const chartData = {
    labels: camera.history.slice(-60).map((e) => formatTime(e.timestamp)),
    datasets: [
      {
        label: 'Aantal personen',
        data: camera.history.slice(-60).map((e) => e.count),
        borderColor: 'rgb(59, 130, 246)',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        fill: true,
        tension: 0.3,
        pointRadius: 0,
        borderWidth: 2,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
      callbacks: {
        title: (items: { label: string }[]) => items[0]?.label || '',
        label: (item: { parsed: { y: number | null } }) => `${item.parsed.y ?? 0} personen`,
      },
      },
    },
    scales: {
      x: {
        display: true,
        ticks: {
          maxTicksLimit: 6,
          font: { size: 10 },
        },
        grid: { display: false },
      },
      y: {
        beginAtZero: true,
        ticks: {
          stepSize: 1,
          font: { size: 10 },
        },
        grid: { color: 'rgba(0,0,0,0.05)' },
      },
    },
  };

  return (
    <div className={`border rounded-xl shadow-sm overflow-hidden ${getCountBg(count)}`}>
      <div className="p-4">
        <div className="flex justify-between items-start mb-3">
          <div>
            <h3 className="font-semibold text-gray-800">{camera.cameraName}</h3>
            {camera.lastAnalyzedAt && (
              <p className="text-xs text-gray-500">
                Laatste analyse: {formatTime(camera.lastAnalyzedAt)}
              </p>
            )}
          </div>
          <div className="text-right">
            <div className={`text-4xl font-bold ${getCountColor(count)}`}>{count}</div>
            <p className="text-xs text-gray-500">
              {camera.current?.confidence === 'high'
                ? 'Hoge zekerheid'
                : camera.current?.confidence === 'medium'
                ? 'Gemiddelde zekerheid'
                : camera.current?.confidence === 'low'
                ? 'Lage zekerheid'
                : ''}
            </p>
          </div>
        </div>

        {camera.lastError && (
          <div className="mb-3 p-2 bg-red-100 border border-red-200 rounded text-sm text-red-700">
            {camera.lastError}
          </div>
        )}

        <div className="flex gap-2 mb-3">
          <button
            onClick={() => onAnalyze(camera.cameraId)}
            disabled={analyzing}
            className="text-xs px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-lg transition-colors"
          >
            {analyzing ? 'Analyseren...' : 'Nu analyseren'}
          </button>
          <button
            onClick={() => {
              setShowSnapshot(!showSnapshot);
              setSnapshotKey((k) => k + 1);
            }}
            className="text-xs px-3 py-1.5 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
          >
            {showSnapshot ? 'Verberg beeld' : 'Toon beeld'}
          </button>
        </div>

        {showSnapshot && (
          <div className="mb-3 rounded-lg overflow-hidden bg-black">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={snapshotKey}
              src={`/api/camera/snapshot?id=${camera.cameraId}&t=${snapshotKey}`}
              alt={`Snapshot ${camera.cameraName}`}
              className="w-full h-auto"
              onError={(e) => {
                (e.target as HTMLImageElement).src = '';
                (e.target as HTMLImageElement).alt = 'Kan snapshot niet laden';
              }}
            />
          </div>
        )}

        {camera.history.length > 1 && (
          <div className="h-32">
            <Line data={chartData} options={chartOptions} />
          </div>
        )}
      </div>
    </div>
  );
}

export default function CameraMonitorPage() {
  const { isLoggedIn, isLoading: authLoading } = useAuth();
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState<Record<string, boolean>>({});
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastAnalyzeResult, setLastAnalyzeResult] = useState<AnalyzeResult | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/camera/status?hours=4');
      if (!res.ok) throw new Error('Status ophalen mislukt');
      const data: StatusResponse = await res.json();
      setStatus(data);
    } catch (error) {
      console.error('Status fout:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const analyzeCamera = useCallback(
    async (cameraId?: string) => {
      const key = cameraId || '__all__';
      setAnalyzing((prev) => ({ ...prev, [key]: true }));
      try {
        const res = await fetch('/api/camera/count', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(cameraId ? { cameraId } : {}),
        });
        if (!res.ok) throw new Error('Analyse mislukt');
        const data: AnalyzeResult = await res.json();
        setLastAnalyzeResult(data);
        await fetchStatus();
      } catch (error) {
        console.error('Analyse fout:', error);
      } finally {
        setAnalyzing((prev) => ({ ...prev, [key]: false }));
      }
    },
    [fetchStatus]
  );

  useEffect(() => {
    if (isLoggedIn && !authLoading) {
      fetchStatus();
    }
  }, [isLoggedIn, authLoading, fetchStatus]);

  useEffect(() => {
    if (autoRefresh && isLoggedIn) {
      intervalRef.current = setInterval(fetchStatus, 30000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [autoRefresh, isLoggedIn, fetchStatus]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <p className="text-gray-600">Laden...</p>
      </div>
    );
  }

  const totalCount = status?.totalCount ?? 0;

  return (
    <div className="min-h-screen bg-gray-100 font-sans">
      <div className="p-4">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="bg-white shadow-xl rounded-2xl p-6 mb-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
                  Camera Monitor
                </h1>
                <p className="text-sm text-gray-500 mt-1">
                  AI-gestuurde winkelbezetting
                </p>
              </div>

              <div className="flex items-center gap-3">
                <div className={`text-center px-6 py-3 rounded-xl border-2 ${getCountBg(totalCount)}`}>
                  <div className={`text-3xl font-bold ${getCountColor(totalCount)}`}>
                    {totalCount}
                  </div>
                  <div className="text-xs text-gray-600 font-medium">Totaal in winkel</div>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 mt-4">
              <button
                onClick={() => analyzeCamera()}
                disabled={analyzing['__all__']}
                className="text-sm px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-xl shadow transition-colors"
              >
                {analyzing['__all__'] ? 'Alle camera\'s analyseren...' : 'Alle camera\'s analyseren'}
              </button>
              <button
                onClick={fetchStatus}
                className="text-sm px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-xl shadow transition-colors"
              >
                Status vernieuwen
              </button>
              <label className="flex items-center gap-2 text-sm text-gray-600 ml-2">
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                  className="rounded border-gray-300"
                />
                Auto-refresh (30s)
              </label>
            </div>
          </div>

          {/* Last analysis result banner */}
          {lastAnalyzeResult && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-sm text-blue-800">
                    Laatste analyse: <strong>{new Date(lastAnalyzeResult.timestamp).toLocaleTimeString('nl-BE', { timeZone: 'Europe/Brussels' })}</strong>
                    {' '}via <strong>{lastAnalyzeResult.provider}</strong>
                    {' '}&mdash; <strong>{lastAnalyzeResult.totalCount} personen</strong> totaal
                  </p>
                  {lastAnalyzeResult.cameras.map((c) => (
                    <p key={c.cameraId} className="text-xs text-blue-600 mt-1">
                      {c.cameraName}: {c.error ? `Fout: ${c.error}` : `${c.count} personen (${c.confidence})`}
                      {c.details && ` - ${c.details}`}
                    </p>
                  ))}
                </div>
                <button
                  onClick={() => setLastAnalyzeResult(null)}
                  className="text-blue-400 hover:text-blue-600 ml-4"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          )}

          {/* Camera cards */}
          {loading ? (
            <div className="text-center py-12">
              <p className="text-gray-600">Camera status laden...</p>
            </div>
          ) : !status || status.cameras.length === 0 ? (
            <div className="bg-white shadow-xl rounded-2xl p-8 text-center">
              <p className="text-gray-800 text-lg mb-2">Geen camera&apos;s geconfigureerd</p>
              <p className="text-gray-500 text-sm mb-4">
                Voeg camera&apos;s toe in <code className="bg-gray-100 px-2 py-0.5 rounded">.env.local</code> en
                start de camera-proxy op de Windows PC.
              </p>
              <div className="text-left bg-gray-50 rounded-lg p-4 max-w-lg mx-auto">
                <pre className="text-xs text-gray-700 whitespace-pre-wrap">
{`CAMERA_1_NAME=Winkel Ingang
CAMERA_1_SNAPSHOT_URL=http://192.168.1.79:9090/snapshot/1
CAMERA_2_NAME=Camera 2
CAMERA_2_SNAPSHOT_URL=http://192.168.1.79:9090/snapshot/2`}
                </pre>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {status.cameras.map((camera) => (
                <CameraCard
                  key={camera.cameraId}
                  camera={camera}
                  onAnalyze={analyzeCamera}
                  analyzing={!!analyzing[camera.cameraId]}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
