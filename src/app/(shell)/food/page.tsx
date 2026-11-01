import { Plus } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { EmptyRow, FilterBar, FilterField, Pagination, TBody, TableCard, Td, THead, Th, Tr } from "@/components/ui/table";
import { Input, Select } from "@/components/ui/fields";
import { FoodForm } from "@/components/forms/profile-forms";
import { requirePageUser } from "@/lib/auth/guard";
import { can } from "@/lib/auth/permissions";
import { listFoodCategories, listFoodPage } from "@/lib/db/repositories/catalog";
import { parsePage } from "@/lib/db/sql";
import { fmtInr } from "@/lib/format";
import { asInt, readParams, type SearchParams } from "@/lib/page";

export const metadata = { title: "Food catalogue" };

export default async function FoodPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requirePageUser("food:read");
  const p = await readParams(searchParams);
  const [result, categories] = await Promise.all([listFoodPage(p.q ?? "", parsePage(p, 25), asInt(p.categoryId)), listFoodCategories()]);
  const admin = can(user.role, "food:manage");
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Data" title="Food catalogue" description="The canonical food items every procurement, waste record and field log is matched to. Search tolerates typos." actions={admin ? <Modal trigger="Add food item" title="Add a canonical food item" triggerIcon={<Plus aria-hidden className="size-4" />}><FoodForm categories={categories} /></Modal> : undefined} />
      <FilterBar action="/food" resetHref="/food">
        <FilterField label="Search" name="q"><Input name="q" defaultValue={p.q} placeholder="e.g. panner, biriyani" /></FilterField>
        <FilterField label="Category" name="categoryId"><Select name="categoryId" defaultValue={p.categoryId ?? ""}><option value="">All categories</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</Select></FilterField>
      </FilterBar>
      <TableCard footer={<Pagination page={result.page} pages={result.pages} total={result.total} basePath="/food" params={{ q: p.q, categoryId: p.categoryId }} />}>
        <THead><Th>Name</Th><Th>Category</Th><Th>Unit</Th><Th align="right">Avg cost</Th><Th>Edible as is</Th><Th>Semantic index</Th></THead>
        <TBody>
          {result.rows.length === 0 && <EmptyRow cols={6}>No food items match.</EmptyRow>}
          {result.rows.map((f) => (
            <Tr key={f.food_id}>
              <Td className="font-medium">{f.canonical_name}</Td>
              <Td className="text-ink-muted">{f.category_name}</Td>
              <Td>{f.base_unit}</Td>
              <Td align="right">{fmtInr(Number(f.avg_cost_per_unit))}</Td>
              <Td>{f.is_edible_as_is ? <Badge tone="ok">Yes</Badge> : <Badge tone="neutral">No</Badge>}</Td>
              <Td>{f.has_embedding ? <Badge tone="ok">Embedded</Badge> : <Badge tone="warn">Pending</Badge>}</Td>
            </Tr>
          ))}
        </TBody>
      </TableCard>
    </div>
  );
}
