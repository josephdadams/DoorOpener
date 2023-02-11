'use strict';
const Store = require('electron-store');

module.exports = new Store({
	defaults: {
		calendarPollingRate: 60,
		checkEventRate: 10,
		cleanupRate: 24,
		precursorTime: 15,
		doors: [
			{
				id: "1",
				enabled: true,
				name: "NIWOT EAST ENTRANCE",
				relay_address: "10.1.95.11",
				relay_name: "ni|ExtEastEntrance",
				webcal: "http://calendar.planningcenteronline.com/icals/eJxj4ajmsGLLz2Sar2XFlVqcX1BSzWXFVuypxJ-YkxOfWpaaV1LMZsXmGmLFnggU5U0sKCjKL0tNYbPmCLFiK81kPv6CyYq9KNdTidvU1MTEwAgswV5W4qkkWFCalJOZHF-SmZtaDBbmLkgsSswtrmYAALeuIew=784f87741652fee1fed6ac2b8a7a168d1cc41098",
				events: []
			}
		]
	}
});