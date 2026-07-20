# Blue Light Project

## Distributed Mobile Emergency Response Network

### Domain and Community Context

The blue light project is a mobile version of the blue light system that is present on many college campuses. It is meant to be a more modern version of these old traditional systems that are spread apart. When you have an application like this on your phone, you are able to signal for help from anywhere while making it discreet.


Overall this can apply to anyone who wants to use it, but we can specify it to be for all college students in the United States. These communities have a wide range of safety needs in many different environments. These include but are not limited academic and residential buildings in all hours, all transit and large events. This app can help streamline the process for public safety personnel.


The primary deployment reference for this system is the UMass Amherst campus and its immediate surrounding public spaces. This community presents a diverse set of safety needs across multiple environments.

### What are the Scalability Bottlenecks?

A server with a singular node can be feasible during off traffic times and can probably manager the baseline request rates, but it can be the point of failure when there are large demand spikes, especially in times of crisis. These spikes could happen when there are a large amount of requests that come from the same region within a tight timeframe.

An example could be a hockey game at Mullins center. Even a single emergency could cause thousands of people to send concurrent requests in a short time frame causing a spike in traffic. Similar spikes could happen during weather events as well.

In order to be effective and up and running during these spikes, we must serve traffic without any increase in latency during most situations. We must be able to accept all requests during large bursts of traffic,  have regional routing so that requests are processed by the right services based on locality, rank and send out responses to incidents based on the severity, and make sure we can resolve a user's location correctly for each request.

### Computing for the Common Good

The blue light project is designed to help everyone who needs an immediate response to a crisis that they are facing. This could be students who are walking alone or late at night and are feeling unsafe, students who are facing an extreme medical emergency and may not be able to talk to a responder or even responders who are having trouble dispatching resources properly and lack a system that allows them to be effective.

When this system fails any student in distress will get slow help, or even no help at all. Responders may miss students who need help, and overall this will create a lack of trust in the system and it loses its effectiveness. This system must stay up in the most critical high traffic times for it to be useful, effective, and trusted. Otherwise it is not worth using.
