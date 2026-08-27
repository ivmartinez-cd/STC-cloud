import HifiPagination from '../../../shared/components/HifiPagination';

interface Props { page: number; total: number; totalPages: number; pageSize: number; onChange: (page: number) => void }

export default function IncidentsPagination({ page, total, totalPages, pageSize, onChange }: Props) {
  return <HifiPagination page={page} totalPages={totalPages} total={total} pageSize={pageSize} itemLabel="incidentes" onPageChange={onChange} />;
}
