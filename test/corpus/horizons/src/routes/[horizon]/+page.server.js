import { db } from '#lib/server/db/index.js';
import { goals, horizonsEnum } from '#lib/server/db/schema.js';
import { listPeriods } from '#lib/periods.js';
import { fail, error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';

export async function load({ params }) {
	if (!horizonsEnum.enumValues.includes(params.horizon)) {
		error(404, 'Not found');
	}

	const allGoals = await db.select().from(goals).where(eq(goals.horizon, params.horizon));

	const periods = listPeriods(params.horizon);

	const columns = periods.map((period) => ({
		...period,
		goals: allGoals.filter((goal) => goal.periodStart === period.start)
	}));

	return {
		goals: allGoals,
		columns,
		horizons: horizonsEnum.enumValues
	};
}

export const actions = {
	create: async ({ request, params }) => {
		const formData = await request.formData();
		const title = formData.get('title');
		const horizon = params.horizon;
		const periodStart = formData.get('periodStart');

		if (!horizonsEnum.enumValues.includes(horizon)) {
			error(404, 'Not found');
		}

		const isValidPeriod = listPeriods(horizon).some((period) => period.start === periodStart);
		if (!isValidPeriod) {
			return fail(400, { message: 'Choose a valid period' });
		}

		if (typeof title !== 'string' || title.trim() === '') {
			return fail(400, { periodStart, message: 'Title is required' });
		}

		try {
			await db.insert(goals).values({
				title: title.trim(),
				horizon,
				periodStart
			});
		} catch (err) {
			console.error(err);
			return fail(500, { title, periodStart, message: 'Could not save. Try again.' });
		}
	}
};
