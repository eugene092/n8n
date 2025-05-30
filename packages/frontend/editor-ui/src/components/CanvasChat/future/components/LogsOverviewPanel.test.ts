import { renderComponent } from '@/__tests__/render';
import LogsOverviewPanel from './LogsOverviewPanel.vue';
import { setActivePinia } from 'pinia';
import { createTestingPinia, type TestingPinia } from '@pinia/testing';
import { mockedStore } from '@/__tests__/utils';
import { useWorkflowsStore } from '@/stores/workflows.store';
import { createRouter, createWebHistory } from 'vue-router';
import { h } from 'vue';
import { fireEvent, waitFor, within } from '@testing-library/vue';
import {
	aiChatExecutionResponse,
	aiChatWorkflow,
	aiManualExecutionResponse,
	aiManualWorkflow,
} from '../../__test__/data';
import { usePushConnectionStore } from '@/stores/pushConnection.store';
import { useNDVStore } from '@/stores/ndv.store';
import { createTestWorkflowObject } from '@/__tests__/mocks';
import { createLogEntries } from '@/components/RunDataAi/utils';

describe('LogsOverviewPanel', () => {
	let pinia: TestingPinia;
	let workflowsStore: ReturnType<typeof mockedStore<typeof useWorkflowsStore>>;
	let pushConnectionStore: ReturnType<typeof mockedStore<typeof usePushConnectionStore>>;
	let ndvStore: ReturnType<typeof mockedStore<typeof useNDVStore>>;

	function render(props: Partial<InstanceType<typeof LogsOverviewPanel>['$props']>) {
		const mergedProps: InstanceType<typeof LogsOverviewPanel>['$props'] = {
			isOpen: false,
			isReadOnly: false,
			isCompact: false,
			scrollToSelection: false,
			execution: {
				...aiChatExecutionResponse,
				tree: createLogEntries(
					createTestWorkflowObject(aiChatWorkflow),
					aiChatExecutionResponse.data?.resultData.runData ?? {},
				),
			},
			latestNodeInfo: {},
			...props,
		};

		return renderComponent(LogsOverviewPanel, {
			props: mergedProps,
			global: {
				plugins: [
					createRouter({
						history: createWebHistory(),
						routes: [{ path: '/', component: () => h('div') }],
					}),
					pinia,
				],
			},
		});
	}

	beforeEach(() => {
		pinia = createTestingPinia({ stubActions: false, fakeApp: true });

		setActivePinia(pinia);

		workflowsStore = mockedStore(useWorkflowsStore);

		pushConnectionStore = mockedStore(usePushConnectionStore);
		pushConnectionStore.isConnected = true;

		ndvStore = mockedStore(useNDVStore);
	});

	it('should not render body if the panel is not open', () => {
		const rendered = render({ isOpen: false });

		expect(rendered.queryByTestId('logs-overview-empty')).not.toBeInTheDocument();
	});

	it('should render empty text if there is no execution', () => {
		const rendered = render({ isOpen: true, execution: undefined });

		expect(rendered.queryByTestId('logs-overview-empty')).toBeInTheDocument();
	});

	it('should render summary text and executed nodes if there is an execution', async () => {
		const rendered = render({ isOpen: true });
		const summary = within(rendered.container.querySelector('.summary')!);

		expect(summary.queryByText('Success in 1.999s')).toBeInTheDocument();
		expect(summary.queryByText('555 Tokens')).toBeInTheDocument();

		await fireEvent.click(rendered.getByText('Overview'));

		const tree = within(rendered.getByRole('tree'));

		await waitFor(() => expect(tree.queryAllByRole('treeitem')).toHaveLength(2));

		const row1 = within(tree.queryAllByRole('treeitem')[0]);

		expect(row1.queryByText('AI Agent')).toBeInTheDocument();
		expect(row1.queryByText('Success in 1.778s')).toBeInTheDocument();
		expect(row1.queryByText('Started 00:00:00.002, 26 Mar')).toBeInTheDocument();

		const row2 = within(tree.queryAllByRole('treeitem')[1]);

		expect(row2.queryByText('AI Model')).toBeInTheDocument();
		expect(row2.queryByText('Error')).toBeInTheDocument();
		expect(row2.queryByText('in 1.777s')).toBeInTheDocument();
		expect(row2.queryByText('Started 00:00:00.003, 26 Mar')).toBeInTheDocument();
		expect(row2.queryByText('555 Tokens')).toBeInTheDocument();

		// collapse tree
		await fireEvent.click(row1.getAllByLabelText('Toggle row')[0]);
		await waitFor(() => expect(tree.queryAllByRole('treeitem')).toHaveLength(1));
	});

	it('should open NDV if the button is clicked', async () => {
		const rendered = render({
			isOpen: true,
		});
		const aiAgentRow = (await rendered.findAllByRole('treeitem'))[0];

		expect(ndvStore.activeNodeName).toBe(null);
		expect(ndvStore.output.run).toBe(undefined);

		await fireEvent.click(within(aiAgentRow).getAllByLabelText('Open...')[0]);

		await waitFor(() => {
			expect(ndvStore.activeNodeName).toBe('AI Agent');
			expect(ndvStore.output.run).toBe(0);
		});
	});

	it('should trigger partial execution if the button is clicked', async () => {
		const spyRun = vi.spyOn(workflowsStore, 'runWorkflow');

		const rendered = render({
			isOpen: true,
			execution: {
				...aiManualExecutionResponse,
				tree: createLogEntries(
					createTestWorkflowObject(aiManualWorkflow),
					aiManualExecutionResponse.data?.resultData.runData ?? {},
				),
			},
		});
		const aiAgentRow = (await rendered.findAllByRole('treeitem'))[0];

		await fireEvent.click(within(aiAgentRow).getAllByLabelText('Test step')[0]);
		await waitFor(() =>
			expect(spyRun).toHaveBeenCalledWith(expect.objectContaining({ destinationNode: 'AI Agent' })),
		);
	});

	it('should toggle subtree when chevron icon button is pressed', async () => {
		const rendered = render({ isOpen: true });

		await waitFor(() => expect(rendered.queryAllByRole('treeitem')).toHaveLength(2));
		expect(rendered.queryByText('AI Agent')).toBeInTheDocument();
		expect(rendered.queryByText('AI Model')).toBeInTheDocument();

		// Close subtree of AI Agent
		await fireEvent.click(rendered.getAllByLabelText('Toggle row')[0]);

		await waitFor(() => expect(rendered.queryAllByRole('treeitem')).toHaveLength(1));
		expect(rendered.queryByText('AI Agent')).toBeInTheDocument();
		expect(rendered.queryByText('AI Model')).not.toBeInTheDocument();

		// Re-open subtree of AI Agent
		await fireEvent.click(rendered.getAllByLabelText('Toggle row')[0]);

		await waitFor(() => expect(rendered.queryAllByRole('treeitem')).toHaveLength(2));
		expect(rendered.queryByText('AI Agent')).toBeInTheDocument();
		expect(rendered.queryByText('AI Model')).toBeInTheDocument();
	});
});
