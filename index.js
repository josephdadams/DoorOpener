'use strict';
const path = require('path');
const {app, BrowserWindow, Menu, ipcMain, nativeImage, dialog} = require('electron');
/// const {autoUpdater} = require('electron-updater');
const {is} = require('electron-util');
const unhandled = require('electron-unhandled');
const debug = require('electron-debug');
const contextMenu = require('electron-context-menu');
const config = require('./config.js');
const menu = require('./menu.js');

//General Variables
const ical = require('node-ical');
const axios = require('axios');

//how often to check for new webcal events
var CALENDAR_POLLING_RATE = 60 * 1000; //60 seconds

//how often to check existing events to trigger a relay
var CHECK_EVENT_RATE = 5 * 1000; //5 seconds

//how often to do cleanup/maintenance of expired events
var CLEANUP_RATE = 24 * 60 * 60 * 1000; // every 24 hours

//amount of time before an event that a relay can be triggered
var PRECURSOR_TIME = 15 * 60 * 1000; //15 minutes, in milliseconds

var INTERVAL_DOOR_POLLING = null;
var INTERVAL_CHECK_EVENTS = null;
var INTERVAL_CLEAN_EVENTS = null;

var Doors = [];

unhandled();
//debug();
contextMenu();

// Note: Must match `build.appId` in package.json
app.setAppUserModelId('com.josephadams.DoorOpener');

// Uncomment this before publishing your first version.
// It's commented out as it throws an error if there are no published versions.
// if (!is.development) {
// 	const FOUR_HOURS = 1000 * 60 * 60 * 4;
// 	setInterval(() => {
// 		autoUpdater.checkForUpdates();
// 	}, FOUR_HOURS);
//
// 	autoUpdater.checkForUpdates();
// }

// Prevent window from being garbage collected
let mainWindow;

const createMainWindow = async () => {
	const win = new BrowserWindow({
		title: app.name,
		show: false,
		width: 850,
		height: 900,
		webPreferences: {
			contextIsolation: false,
			nodeIntegration: true,
			enableRemoteModule: true
		}
	});

	win.on('ready-to-show', () => {
		win.show();
	});

	win.on('closed', () => {
		// Dereference the window
		// For multiple windows store them in an array
		mainWindow = undefined;
	});

	await win.loadFile(path.join(__dirname, 'index.html'));

	return win;
};

// Prevent multiple instances of the app
if (!app.requestSingleInstanceLock()) {
	app.quit();
}

app.on('second-instance', () => {
	if (mainWindow) {
		if (mainWindow.isMinimized()) {
			mainWindow.restore();
		}

		mainWindow.show();
	}
});

app.on('window-all-closed', () => {
	if (!is.macos) {
		app.quit();
	}
});

app.on('activate', async () => {
	if (!mainWindow) {
		mainWindow = await createMainWindow();
	}
});

//IPCs
ipcMain.on('reload', function (event) {
	startUp();
});

//Functions
function startUp() {
	clearInterval(INTERVAL_DOOR_POLLING);
	clearInterval(INTERVAL_CHECK_EVENTS);
	clearInterval(INTERVAL_CLEAN_EVENTS);

	loadConfig();
	startPolling();

	INTERVAL_CHECK_EVENTS = setInterval(checkEvents, CHECK_EVENT_RATE);
	INTERVAL_CLEAN_EVENTS = setInterval(cleanEvents, CLEANUP_RATE);
}

function loadConfig() {
	try {
		CALENDAR_POLLING_RATE = config.get('calendarPollingRate') * 1000
		
		CHECK_EVENT_RATE = config.get('checkEventRate') * 1000;
		CLEANUP_RATE = config.get('cleanupRate') * 60 * 60 * 1000;
		PRECURSOR_TIME = config.get('precursorTime') * 60 * 1000;

		Doors = config.get('doors');;
		logger('Door information loaded.', 'info');
	}
	catch(error) {
		logger('Error loading information.');
		logger(error.toString())
	}
}

function startPolling() {
	try {
		if (Doors.length > 0) {
			logger('Starting WebCal polling:');
	
			for (let i = 0; i < Doors.length; i++) {
				logger('Checking Door: ' + Doors[i].name, 'info');
				if (Doors[i].enabled) {
					if (Doors[i].webcal) {
						checkCalendar(Doors[i]);
					}
					else {
						logger('This door does not have a webcal configured: ' + Doors[i].name, 'error');
					}
				}
				else {
					logger(`Door ${Doors[i].name} is not enabled. No events will be added.`, 'info');
				}
			}
	
			INTERVAL_DOOR_POLLING = setTimeout(startPolling, CALENDAR_POLLING_RATE);
		}
		else {
			//no doors, so quit the program
			logger('No doors configured. Exiting program.', 'error');
			process.exit(0);
		}
	}
	catch(error) {
		logger(`Error occured while polling for WebCal data: ${error}`, 'error');
	}
}

function checkCalendar(door) {
	try {
		logger(`Checking Calendar for Door: ${door.name}`, 'info');

		let counter = 0;
	
		let dtNow = new Date();
	
		ical.fromURL(door.webcal, {}, function (err, data) {
			for (let k in data) {
				if (data.hasOwnProperty(k)) {
					const ev = data[k];
					if (data[k].type == 'VEVENT') {
						if (ev.start >= dtNow) {
							let added = addEvent(door.id, ev.uid, ev.summary, ev.start, ev.end);
							if (added) {
								//only increment the counter if the event was actually added
								counter++;
							}
						}
					}
				}
			}
	
			logger(`${counter} New Events added.`, 'info');
		});
	}
	catch(error) {
		logger(`Error occured while retrieving WebCal data: ${error}`, 'error');
	}
}

function addEvent(doorId, uid, summary, start, end) {
	let returnVal = false;

	try {
		for (let i = 0; i < Doors.length; i++) {
			if (Doors[i].id === doorId) {
				if (Doors[i].events && Doors[i].events.constructor !== Array) {
					Doors[i].events = [];
				}
				let eventObj = {};
				eventObj.uid = uid;
				eventObj.summary = summary;
				eventObj.start = start;
				eventObj.end = end;
				//check that the event is not already in the list before adding it
				let found = false;
				for (let j = 0; j < Doors[i].events.length; j++) {
					if (Doors[i].events[j].uid === uid) {
						found = true;
						break;
					}
				}
				if (!found) {
					logger(`Adding: [${Doors[i].name}]: ${summary}`, 'info');
					Doors[i].events.push(eventObj);
					returnVal = true;
				}
			}
		}
	}
	catch(error) {
		logger(`Error occured while adding event: ${error}`, 'error');
	}
	finally {
		return returnVal;
	}
}

function checkEvents() {
	try {
		logger(`Checking Door Schedules. Every ${CHECK_EVENT_RATE}ms.`, 'info');
		console.log('check event rate: ' + config.get('checkEventRate') + ' seconds');

		let dtNow = new Date().getTime();
	
		for (let i = 0; i < Doors.length; i++) {
			let door_stayopened = false;
	
			//check if the door should be open right now
			for (let j = 0; j < Doors[i].events.length; j++) {
				let event = Doors[i].events[j];
				if (dtNow >= (event.start.getTime() - PRECURSOR_TIME)) {
					// if the current time is past a start time, then check the end time
					if (dtNow < event.end.getTime()) {
						//if the current time is not past the end time, open the door
						door_stayopened = true;
						logger(`Event says door should be opened: ${Doors[i].name}`, 'info');
						openDoor(Doors[i]);
					}
				}
			}
	
			//now check if the door can be closed
			for (let j = 0; j < Doors[i].events.length; j++) {
				let event = Doors[i].events[j];
	
				if (dtNow >= event.end.getTime()) {
					if (!door_stayopened) {
						closeDoor(Doors[i]);
					}
				}
			}
		}
	}
	catch(error) {
		logger(`Error occured while checking Door Schedules: ${error}`, 'error');
	}
}

function cleanEvents() {
	try {
		logger(`Cleaning Out the Database and Removing Old Events.`, 'info');
		let dtNow = new Date().getTime();
	
		let delEvents = [];
	
		for (let i = 0; i < Doors.length; i++) {
			//check if an event is old and should be removed
			for (let j = 0; j < Doors[i].events.length; j++) {
				let event = Doors[i].events[j];
	
				if (dtNow >= event.end.getTime()) {
					let delObj = {
						doorId: Doors[i].id,
						uid: event.uid
					};
					delEvents.push(delObj);
				}
			}
		}
	
		logger(`Found ${delEvents.length} that have expired. Removing them now.`, 'info');
		deleteEvents(delEvents);
		logger(`Cleaning Complete. ${delEvents.length} expired events removed.`, 'info');
	}
	catch(error) {
		logger(`Error occured while cleaning expired events: ${error}`, 'error');
	}
}

function deleteEvents(delEvents) {
	try {
		for (let k = 0; k < delEvents.length; k++) {
			for (let i = 0; i < Doors.length; i++) {
				if (Doors[i].id === delEvents[k].doorId) {
					for (let j = 0; j < Doors[i].events.length; j++) {
						if (Doors[i].events[j].uid === delEvents[k].uid) {
							Doors[i].events.splice(j, 1);
							break;
						}
					}
				}
			}
		}
	}
	catch(error) {
		logger(`Error occured while deleting events: ${error}`, 'error');
	}
}

function openDoor(door) {
	logger(`Opening Door: ${door.name}`, 'info');
	updateRelay(door, 1);
}

function closeDoor(door) {
	logger(`Closing Door: ${door.name}`, 'info');
	updateRelay(door, 0);
}

function updateRelay(door, action) {
	try {
		let statusUrl = `http://${door.relay_address}/customState.json`;

		axios.get(statusUrl)
		.then(res => {
			if (res.data) {
				//check status before attempting change, if it's already the current value, no need to change anything
				if (res.data[door.relay_name]) {
					if (res.data[door.relay_name].toString() !== action.toString()) {
						//the door is currently the opposite of the proposed action, so let's change it
						let commandUrl = `http://${door.relay_address}/customState.json?${door.relay_name}=${action}`;

						axios.get(commandUrl)
						.then(res => {
							//do something with the response (or don't)
							if (mainWindow) {
								let dtNow = new Date();
								mainWindow.webContents.send('door_action', door, action, dtNow);
							}
						})
						.catch(err => {
							logger(`Error: ${err.message}`, 'error');
						});
					}
					else {
						logger('Door is already in this state, so no action.', 'info');
					}
				}
			}
		})
		.catch(err => {
			logger(`Error: ${err.message}`, 'error');
		});
	}
	catch(error) {
		logger(`Error occured while updating relay: ${error}`, 'error');
	}
}

function logger(logtext, type) {
	//logs the item to the console

	try {
		let dtNow = new Date();

		console.log(logtext);
		sendToUI(logtext, type, dtNow);
	}
	catch(error) {
		logger(`Error occured while logging information to the console: ${error}`, 'error');
	}
}

function sendToUI(logtext, type, dtNow) {
	try {
		if (mainWindow) {
			mainWindow.webContents.send('log', logtext, type, dtNow);
		}
	}
	catch(error) {
		console.log(`Error occured while sending information to the UI: ${error}`); //don't use logger function to avoid infinite loop
	}
}

(async () => {
	await app.whenReady();
	Menu.setApplicationMenu(menu);
	mainWindow = await createMainWindow();

	startUp();
})();