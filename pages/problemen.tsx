import ProblemsPanel from '@/components/ProblemsPanel';
import { useAuth } from '@/lib/hooks/useAuth';

export default function ProblemenPage() {
  const { isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center text-gray-500">
        Laden…
      </div>
    );
  }

  return <ProblemsPanel projectLabel="Babette POS" />;
}
