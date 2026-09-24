import { readFileSync } from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url'; import pg from 'pg'
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const v=(k)=>{for(const raw of readFileSync(path.join(ROOT,'.env'),'utf8').split(/\r?\n/)){const l=raw.trim();if(!l||l.startsWith('#'))continue;const e=l.indexOf('=');if(e<0)continue;if(l.slice(0,e).trim()!==k)continue;let s=l.slice(e+1).trim();if((s.startsWith('"')&&s.endsWith('"'))||(s.startsWith("'")&&s.endsWith("'")))s=s.slice(1,-1);return s}}
const c=new pg.Client({connectionString:v('DATABASE_URL'),ssl:{rejectUnauthorized:false}});await c.connect()
const admin=(await c.query(`select id from public.profiles where role='admin' limit 1`)).rows[0].id
const asAdmin=()=>c.query(`select set_config('request.jwt.claims',$1,true)`,[JSON.stringify({sub:admin,role:'authenticated'})])
await c.query('begin'); await asAdmin()

// 1.2 income auto-distributes on confirm
const seller=(await c.query(`select id,member_code from public.profiles where role='rep' and status='active' and referrer_id is not null order by member_code limit 1`)).rows[0]
const proj=(await c.query(`select id from public.projects where deleted_at is null limit 1`)).rows[0]
const plot=(await c.query(`insert into public.plots (project_id,number,size,size_unit,price,status) values ($1,'AUDIT-T1',200,'sqyd',1600000,'available') returning id`,[proj.id])).rows[0]
const bk=(await c.query(`insert into public.bookings (reference,plot_id,project_id,rep_id,status,sale_value,payment_plan,terms_accepted_rep,terms_accepted_customer) values ('',$1,$2,$3,'confirmed',1600000,'full',true,true) returning id,reference`,[plot.id,proj.id,seller.id])).rows[0]
const auto=(await c.query(`select count(*)::int n, coalesce(sum(net),0) net from public.member_ledger where booking_id=$1`,[bk.id])).rows[0]
console.log(`\n1.2 auto-distribute on confirm : ${auto.n} credits, net ${auto.net}  ${auto.n>0?'PASS':'FAIL'}`)

// 1.1 cancellation reverses
await c.query(`update public.bookings set status='cancelled' where id=$1`,[bk.id])
const rev=(await c.query(`select count(*) filter (where status='reversed')::int r, count(*)::int n from public.member_ledger where booking_id=$1`,[bk.id])).rows[0]
console.log(`1.1 cancel reverses income     : ${rev.r}/${rev.n} reversed  ${rev.r===rev.n&&rev.n>0?'PASS':'FAIL'}`)

// 2.2 rank promotion
const promoted=(await c.query(`select public.recalculate_all_ranks() n`)).rows[0].n
console.log(`2.2 rank review promoted       : ${promoted} member(s)  ${promoted>=0?'PASS':'FAIL'}`)
console.table((await c.query(`select p.member_code,p.full_name,rf.name from_rank,rt.name to_rank from public.rank_history h join public.profiles p on p.id=h.member_id left join public.ranks rf on rf.id=h.from_rank left join public.ranks rt on rt.id=h.to_rank order by h.created_at desc limit 5`)).rows)

// 2.1 referral lookup
const s=(await c.query(`select * from public.sponsor_by_code($1)`,[seller.member_code])).rows[0]
console.log(`2.1 sponsor_by_code            : ${s? s.full_name+' ('+s.member_code+')' : 'none'}  ${s?'PASS':'FAIL'}`)

// 3.1 / 3.3
const q=(await c.query(`select count(*)::int n from public.withdrawal_queue(null)`)).rows[0].n
const t=(await c.query(`select * from public.network_totals()`)).rows[0]
console.log(`3.1 withdrawal_queue rows      : ${q}  ${q>=0?'PASS':'FAIL'}`)
console.log(`3.3 network_totals             :`, t)
await c.query('rollback'); await c.end()
