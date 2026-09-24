import { FileText } from 'lucide-react'
import { openPrivateFile } from '@/lib/supabase'
import { useDocuments } from '@/lib/queries'
import {
  Button, Card, CardHeader, EmptyState, PageHeader, Spinner, Table, Td, Th, useToast,
} from '@/components/ui'
import { Badge } from '@/components/ui'
import { date, num, titleCase } from '@/lib/format'

const TONE: Record<string, 'blue' | 'green' | 'violet' | 'neutral'> = {
  welcome_letter: 'green',
  booking_form: 'blue',
  receipt: 'violet',
  registry: 'violet',
}

export function DocumentsPage({ title = 'My documents' }: { title?: string }) {
  const { data = [], isLoading } = useDocuments()
  const { push } = useToast()

  return (
    <>
      <PageHeader
        title={title}
        description="Welcome letters, booking forms, receipts and registry copies for your deals."
      />
      <Card>
        <CardHeader title={`${num(data.length)} documents`} />
        {isLoading ? (
          <Spinner />
        ) : data.length === 0 ? (
          <EmptyState
            title="No documents yet"
            description="Paperwork is generated automatically when a booking is approved and when payments are verified."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Document</Th>
                <Th>Type</Th>
                <Th>Created</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.id} className="hover:bg-slate-50">
                  <Td>
                    <span className="flex items-center gap-2 font-medium text-slate-900">
                      <FileText className="h-4 w-4 text-slate-400" />
                      {d.title}
                    </span>
                  </Td>
                  <Td>
                    <Badge tone={TONE[d.type] ?? 'neutral'}>{titleCase(d.type)}</Badge>
                  </Td>
                  <Td className="text-xs">{date(d.created_at)}</Td>
                  <Td>
                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          void openPrivateFile(d.type === 'registry' ? 'registry' : 'documents', d.storage_path).catch(
                            (err) => push('error', err instanceof Error ? err.message : 'Could not open the file'),
                          )
                        }
                      >
                        Download
                      </Button>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  )
}
