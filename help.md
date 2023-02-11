# Door Opener

## Configuration

The program must be configured with the doors (relays) and webcal links. Each door should have a unique webcal link.

* `PRECURSOR_TIME`: The amount of time a door should unlock prior to an event. Default is 15 minutes prior. Value is in milliseconds.
* `CHECK_EVENT_RATE`: How often to check loaded events for a door unlock/lock event. Default is 5 seconds. Value is in milliseconds.
* `CALENDAR_POLLING_RATE`: How often to poll the webcal links for new events. Default is every 60 seconds. Value is in milliseconds.
* `CLEANUP_RATE`: How often to clean up arrays and objects of expired (past) events. Default is every 24 hours. Value is in milliseconds.

Each door is assumed to have a unique calendar. To add more doors, you can edit the config.json file and add another entry:

```javascript
{
	"id": "uniqueid",
	"enabled": true,
	"name": "Friendly Door Name",
	"relay_address": "10.1.95.11",
	"relay_name": "relayname",
	"webcal": "http://to/ical/link",
	"events": []
}
```

`id`: a unique string for that door. Can be literally any value you want as long as it is unique from the other doors.
`enabled`: true/false. Whether to unlock/lock this door based on its calendar events or ignore it for now.
`name`: Friendly name for the system to use
`relay_address`: IP address of that relay
`relay_name`: What the relay is named in the relay system - this is important to be right as it is what actually is triggered
`webcal`: iCal link from PCO
`events`: an empty array that will be populated with events from the webcal link. You can leave this blank.

Any time you want to add another door, you edit this file and the service will restart.

## How it works

The program first loads all of the events for each door by fetching them from the webcal/iCal link, and storing them in the `events` array for that particular door.

Then it begins checking the events based on the predefined polling rate. When the event time says the door should be unlocked, it first makes a request to see if it's already unlocked. If it is, it does nothing. If it needs to be unlocked, a command is sent to trigger the relay. Same for locked. If an event has passed, it will trigger the relay to close. If the door is already in the needed state, nothing is done.