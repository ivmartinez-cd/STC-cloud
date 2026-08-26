import HifiPagination from '../../../shared/components/HifiPagination';
import { PAGE_SIZE } from '../lib/incidentPresentation';

interface Props { page: number; total: number; totalPages: number; onChange: (page: number) => void }

export default function IncidentsPagination({ page, total, totalPages, onChange }: Props) {
  return <HifiPagination page={page} totalPages={totalPages} total={total} pageSize={PAGE_SIZE} itemLabel="incidentes" onPageChange={onChange} />;
}
