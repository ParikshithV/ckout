import {type Settings} from './ai/config.js';

export type View = 'commit' | 'branch' | 'pr' | 'config';

export type Flags = {
	yes: boolean;
	noPush: boolean;
	verbose: boolean;
	message?: string;
};

export type ViewProps = {
	root: string;
	settings: Settings;
	flags: Flags;
	/** Switch to another view in place. */
	onSwitch: (view: View) => void;
	/** Leave a final line in the scrollback and exit. */
	onDone: (text: string, exitCode?: number) => void;
};
