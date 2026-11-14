# Ultra-Fin / In-Slab Heat Loss & Layout Calculator
This is a ready-to-run React + Vite + TypeScript project with Tailwind styling.
## Run
npm i
npm run dev
## Build
npm run build
npm run preview

## Experimental Luna V2.4 plan import

1. Configure `OPENAI_API_KEY` only in `python-backend/.env`.
2. Run the Python backend on `http://127.0.0.1:8001`.
3. Set `VITE_PLAN_BACKEND_URL=http://127.0.0.1:8001` in this app's `.env`.
4. Run `npm run dev` and open `http://127.0.0.1:5173/project/import`.
5. Upload a PDF, select `V2.4 - GPT-6 Luna`, keep the scope to one page for the first test, and run extraction.
6. Review every room and dimension association before creating a draft project.

The Luna route is `/api/experimental/v2/plans/extract-regions-v24-luna`. It uses the existing V2 evidence contract and preserves the manual review boundary. The API key is never sent to the browser.
