exports.handler = async (event:any) => {
    console.log("Event: ", event);  // Logs the incoming event for debugging

    return {
        statusCode: 200,
        body: JSON.stringify({
            message: "Hello, this is a placeholder lambda",
            input: event,  // Echoes back the event input
        }),
    };
};
