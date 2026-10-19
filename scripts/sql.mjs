// Jednorazowe zapytanie SQL do połączonego projektu (przez Management API).
//   node scripts/sql.mjs "select count(*) from public.profiles"
//   node scripts/sql.mjs -f plik.sql
import { sql } from './cli.mjs'

const args = process.argv.slice(2)
const wiersze = args[0] === '-f' ? sql(null, { plik: args[1] }) : sql(args.join(' '))
console.table(wiersze)
