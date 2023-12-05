<template>
    <div id='app'>
        <div class="navbar">
            <h3 class="text-white">
                TO DO LIST APP
            </h3>
        </div>

        <div class="mt-3">
            <button type="button" @click="changefilterType" style="margin-left: 10px;">
                {{ filterType }}   
            </button>
        </div>

        <div class="mt-3">
            <span>
                <input type="text" class="inputTask" v-model="newTaskName" placeholder="insert new task" />
                <button type="button" class="buttonAdd btn btn-primary" style="margin-left: 10px;" v-on:click="onCreateNewTask">
                    + Create
                </button>
            </span>
        </div>

        <div class="taskTable">
            <table>
                <tr v-for="task in filteredTodos" v-bind:key="task.id">
                    <td>
                        <!-- <input type="checkbox" v-model="task.is_complete" v-on:click="() => onToggleTaskStatus(task.id)"> -->
                        <input type="checkbox" :value="task" v-model="selectedOption">
                    </td>
                    <td>
                        <input v-model="task.title" style="border: none;"
                            @change="() => onEditTask(task)" />
                        <!-- <span>{{ task.title }}</span> -->
                    </td>
                    <td>
                        <button type="button" class="buttonDelete btn btn-danger" v-on:click="() => onDeleteTask(task.id)">
                            Delete
                        </button>
                    </td>
                </tr>
            </table>
        </div>

        <button type="button" class="btn btn-success" v-on:click="saveFile()">Export</button>
        <p v-show="tasks.length === 0">Nothing to do</p>

        <hr>

        <div>
            <input v-model="searchName" placeholder="search" />
            <button type="button" @click="onSearchTask">Search</button>
        </div>

        <table style="margin: 0px auto; width: 420px;">
            <tr v-for="task in searchTasks" v-bind:key="task.id">
                    <td>
                        <span>{{ task.title }}</span>
                    </td>
            </tr>
        </table>
    </div>
</template>
  
<script>
// import { server } from "../helper";
// import axios from "axios";

let id = 0;
const filterTypeList = ['All', 'Ongoing', 'Done'];

export default {
    name: 'App',
    data() {
        return {
            searchName: '',
            newTaskName: '',
            tasks: [
                {
                    id: 0,
                    title: '',
                    is_complete: false
                },
            ],
            filterType: filterTypeList[0],
            searchTasks: []
        };
    },
    mounted() {
        this.onFetchData();
    },
    methods: {
        onFetchData() {
            this.tasks = [
                { id: id++, title: 'Feed the cat', is_complete: false },
                { id: id++, title: 'Clean the windows', is_complete: false },
                { id: id++, title: 'Finish recording Youtube video', is_complete: false }
            ]
            // axios
            //     .get(`${server.baseURL}/tasks`)
            //     .then(data => (this.tasks = data.data));
        },

        onCreateNewTask() {
            const newTask = {
                id: id++,
                title: this.newTaskName,
                is_complete: false
            };

            this.tasks.push(newTask);
            this.newTaskName = '';
            // axios.post(`${server.baseURL}/tasks/create`, newTask)
            //     .then(data => (this.tasks = data.data));

        },

        onEditTask(task) {
            const index = this.tasks.findIndex(i => i.id == task.id);
            this.tasks[index].title = task.title;

            // axios.put(`${server.baseURL}/tasks/update/${task.id}`, task)
            //     .then(data => (this.tasks = data.data));
        },

        onDeleteTask(id) {
            const index = this.tasks.findIndex(i => i.id == id);
            this.tasks.splice(index, 1);

            // axios.delete(`${server.baseURL}/tasks/delete/${id}`)
            //     .then(data => (this.tasks = data.data));
        },

        onToggleTaskStatus(id) {
            const index = this.tasks.findIndex(i => i.id == id);
            this.tasks[index].is_complete = !this.tasks[index].is_complete;

            // axios.put(`${server.baseURL}/tasks/toggle/${id}`)
            //     .then(data => (this.tasks = data.data));
        },

        changefilterType() {
            let nextIndex = filterTypeList.indexOf(this.filterType) + 1;
            if (nextIndex >= filterTypeList.length) {
                this.filterType = filterTypeList[0];
            } else {
                this.filterType = filterTypeList[nextIndex];
            }
        },

        onSearchTask() {
            this.searchTasks = this.tasks.filter(task => task.title.toLowerCase().includes(this.searchName.toLowerCase()));
        },

        saveFile() {
            // const data = this.tasks.filter(i => i.is_complete == true);
            const data = this.selectedOption;
            console.log("data: " + data)

            // convert js value to JSON format
            const str = JSON.stringify(data, null, 2); 
            
            // application/json is JSON text that is 1 of standard for JSON content type
            const blob = new Blob([str], { type: 'application/json' });
            var link = document.createElement('a');

            // create a link pointing to the ObjectURL containing the blob
            link.href = URL.createObjectURL(blob);
            
            link.setAttribute('download', 'file.json');

            // appendChild is methods that appends a node (element) as the last child of an element 

            /*
                <html>
                    <body>
                        <template></template>
                        <scriptt></scriptt>
                        <style></style>
                    </body>
                </html> 
                
            */
            document.body.appendChild(link);

            link.click();

            // Node.removeChild() is a method that removes a child node from the DOM but it still exists in memory just is no longer part of the DOM. It can still be reused later in the code
        },
    },
    computed: {
        filteredTodos() {
            return this.tasks.filter(todo => {
                switch(this.filterType) {
                    case 'Ongoing':
                        return !todo.is_complete;
                    case 'Done':
                        return todo.is_complete;
                    case 'All':
                        return true;
                }
            })
        }
    }
};
</script>
  
<style>
#app {
    text-align: center;
}

.navbar {
  background-color: #16abf8;
  box-shadow: 0px 4px 10px rgba(0, 0, 0, 0.1);
}

.add-button {
  background: #16abf8;
}

.creatNewTask {
    margin-bottom: 10px;
}

.creatNewTask .inputTask {
    width: 300px;
    height: 28px;
}

.creatNewTask .buttonAdd {
    height: 28px;
    margin-left: 10px;
}

.taskTable table {
    background-color: white;
    margin: 0px auto;
    width: 420px;
}

.taskTable p {
    text-align: left;
}

.vertical {
    border-left: 6px solid blue;
    height: 200px;
    position:absolute;
    left: 50%;
}
</style>