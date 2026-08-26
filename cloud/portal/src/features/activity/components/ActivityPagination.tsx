import HifiPagination from '../../../shared/components/HifiPagination';
import { PAGE_SIZE } from '../lib/activityPresentation';

interface Props { page: number; total: number; totalPages: number; onChange: (page: number) => void }

export default function ActivityPagination({ page, total, totalPages, onChange }: Props) {
  return <HifiPagination page={page} totalPages={totalPages} total={total} pageSize={PAGE_SIZE} itemLabel="eventos" onPageChange={onChange} />;
}
